use anyhow::Result;
use seda_sdk_rs::{elog, http_fetch, log, HttpFetchOptions, Process};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Serialize, Deserialize)]
struct CoinMarketCapResponse {
    data: WBTCData,
}

#[derive(Serialize, Deserialize)]
struct WBTCData {
    WBTC: WBTCInfo,
}

#[derive(Serialize, Deserialize)]
struct WBTCInfo {
    quote: QuoteData,
}

#[derive(Serialize, Deserialize)]
struct QuoteData {
    USDC: USDCQuote,
}

#[derive(Serialize, Deserialize)]
struct USDCQuote {
    price: f64,
    percent_change_24h: f64,
    volume_24h: f64,
}

/**
 * Executes the data request phase within the SEDA network.
 * This phase is responsible for fetching WBTC/USDC data from CoinMarketCap
 * and calculating a dynamic LTV ratio based on market conditions.
 */
pub fn execution_phase() -> Result<()> {
    let api_key = "54acfd20-f536-4653-a2cd-a67076049955";
    let symbol = "WBTC";
    let convert = "USDC";

    log!("Fetching WBTC/USDC data from CoinMarketCap");

    let mut headers = BTreeMap::new();
    headers.insert("X-CMC_PRO_API_KEY".to_string(), api_key.to_string());
    let options = HttpFetchOptions {
        headers,
        ..Default::default()
    };

    let response = http_fetch(
        format!(
            "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol={}&convert={}",
            symbol, convert
        ),
        Some(options),
    );

    // Check if the HTTP request was successfully fulfilled
    if !response.is_ok() {
        elog!(
            "HTTP Response was rejected: {} - {}",
            response.status,
            String::from_utf8(response.bytes)?
        );

        Process::error("Error while fetching WBTC/USDC data".as_bytes());
        return Ok(());
    }

    // Parse the API response
    let data = serde_json::from_slice::<CoinMarketCapResponse>(&response.bytes)?;
    let quote = &data.data.WBTC.quote.USDC;

    // Log the fetched data
    log!("Fetched WBTC/USDC price: {}", quote.price);
    log!("24h percent change: {}%", quote.percent_change_24h);
    log!("24h volume: {}", quote.volume_24h);

    // Calculate dynamic LTV based on market conditions
    // Base LTV of 70% adjusted by:
    // - Volume impact: Higher volume increases LTV (up to +5%)
    // - Price volatility impact: Higher volatility decreases LTV (up to -10%)
    // - Price trend impact: Positive price movement increases LTV (up to +3%)
    let base_ltv = 0.70;

    // Volume impact: Scale based on volume relative to price
    let volume_in_usdc = quote.volume_24h;
    let volume_impact = (volume_in_usdc / (quote.price * 1_000_000.0)).min(0.05);

    // Volatility impact: More severe for negative changes
    let volatility_impact = if quote.percent_change_24h < 0.0 {
        (quote.percent_change_24h.abs() / 50.0).min(0.10) // More severe for negative changes
    } else {
        (quote.percent_change_24h / 100.0).min(0.05) // Less severe for positive changes
    };

    // Price trend impact: Small bonus for positive price movement
    let trend_impact = if quote.percent_change_24h > 0.0 {
        (quote.percent_change_24h / 100.0).min(0.03)
    } else {
        0.0
    };

    let dynamic_ltv = base_ltv + volume_impact - volatility_impact + trend_impact;

    // Ensure LTV stays within reasonable bounds (50% to 80%)
    let final_ltv = (dynamic_ltv * 100.0).round().clamp(50.0, 80.0) as u64;

    log!("Calculated dynamic LTV: {}%", final_ltv);
    log!(
        "Components: Base={}%, Volume={}%, Volatility={}%, Trend={}%",
        (base_ltv * 100.0) as u64,
        (volume_impact * 100.0) as u64,
        (volatility_impact * 100.0) as u64,
        (trend_impact * 100.0) as u64
    );

    // Report the LTV ratio back to the SEDA network
    Process::success(&final_ltv.to_le_bytes());

    Ok(())
}
