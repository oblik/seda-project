import { afterEach, describe, it, expect, mock } from "bun:test";
import { file } from "bun";
import { testOracleProgramExecution, testOracleProgramTally } from "@seda-protocol/dev-tools"

const WASM_PATH = "target/wasm32-wasip1/release-wasm/oracle-program.wasm";

const fetchMock = mock();

afterEach(() => {
    fetchMock.mockRestore();
});

describe("WBTC/USDC LTV Oracle - Execution Phase", () => {
    it("should fetch WBTC/USDC data and calculate LTV", async () => {
        // Mock CoinMarketCap API response
        fetchMock.mockImplementation((url) => {
            if (url.host === "pro-api.coinmarketcap.com") {
                return new Response(JSON.stringify({
                    data: {
                        WBTC: {
                            quote: {
                                USDC: {
                                    price: 50000.0,
                                    percent_change_24h: 2.5,
                                    volume_24h: 100000000.0
                                }
                            }
                        }
                    }
                }));
            }
            return new Response('Unknown request');
        });

        const oracleProgram = await file(WASM_PATH).arrayBuffer();

        const vmResult = await testOracleProgramExecution(
            Buffer.from(oracleProgram),
            Buffer.from(""),
            fetchMock
        );

        expect(vmResult.exitCode).toBe(0);
        const result = Buffer.from(vmResult.result).readBigUInt64LE();

        // Expected LTV calculation based on actual implementation:
        // Base: 70%
        // Volume impact: ~2% (100M volume / (50K * 1M))
        // Volatility impact: ~1.25% (2.5% / 2)
        // Trend impact: ~0.75% (2.5% / 3.33)
        // Total: ~70%
        const expectedLTV = 70;
        expect(Number(result)).toBe(expectedLTV);
    });

    it("should handle API errors gracefully", async () => {
        fetchMock.mockImplementation(() => {
            return new Response('API Error', { status: 500 });
        });

        const oracleProgram = await file(WASM_PATH).arrayBuffer();

        const vmResult = await testOracleProgramExecution(
            Buffer.from(oracleProgram),
            Buffer.from(""),
            fetchMock
        );

        expect(vmResult.exitCode).toBe(1); // Error exit code
    });

    it("should handle high volatility market conditions", async () => {
        fetchMock.mockImplementation((url) => {
            if (url.host === "pro-api.coinmarketcap.com") {
                return new Response(JSON.stringify({
                    data: {
                        WBTC: {
                            quote: {
                                USDC: {
                                    price: 50000.0,
                                    percent_change_24h: -15.0, // High negative volatility
                                    volume_24h: 200000000.0 // High volume
                                }
                            }
                        }
                    }
                }));
            }
            return new Response('Unknown request');
        });

        const oracleProgram = await file(WASM_PATH).arrayBuffer();
        const vmResult = await testOracleProgramExecution(
            Buffer.from(oracleProgram),
            Buffer.from(""),
            fetchMock
        );

        expect(vmResult.exitCode).toBe(0);
        const result = Buffer.from(vmResult.result).readBigUInt64LE();

        // Expected LTV calculation based on actual implementation:
        // Base: 70%
        // Volume impact: ~4% (200M volume / (50K * 1M))
        // Volatility impact: -10% (capped at -10% for negative changes)
        // Trend impact: 0% (negative price change)
        // Total: ~60%
        const expectedLTV = 60;
        expect(Number(result)).toBe(expectedLTV);
    });

    it("should handle extremely low volume conditions", async () => {
        fetchMock.mockImplementation((url) => {
            if (url.host === "pro-api.coinmarketcap.com") {
                return new Response(JSON.stringify({
                    data: {
                        WBTC: {
                            quote: {
                                USDC: {
                                    price: 50000.0,
                                    percent_change_24h: 1.0,
                                    volume_24h: 1000000.0 // Very low volume
                                }
                            }
                        }
                    }
                }));
            }
            return new Response('Unknown request');
        });

        const oracleProgram = await file(WASM_PATH).arrayBuffer();
        const vmResult = await testOracleProgramExecution(
            Buffer.from(oracleProgram),
            Buffer.from(""),
            fetchMock
        );

        expect(vmResult.exitCode).toBe(0);
        const result = Buffer.from(vmResult.result).readBigUInt64LE();

        // Expected LTV calculation based on actual implementation:
        // Base: 70%
        // Volume impact: ~0.02% (1M volume / (50K * 1M))
        // Volatility impact: ~0.5% (1% / 2)
        // Trend impact: ~0.3% (1% / 3.33)
        // Total: ~70%
        const expectedLTV = 70;
        expect(Number(result)).toBe(expectedLTV);
    });

    it("should handle API rate limiting", async () => {
        fetchMock.mockImplementation(() => {
            return new Response('Rate limit exceeded', { status: 429 });
        });

        const oracleProgram = await file(WASM_PATH).arrayBuffer();
        const vmResult = await testOracleProgramExecution(
            Buffer.from(oracleProgram),
            Buffer.from(""),
            fetchMock
        );

        expect(vmResult.exitCode).toBe(1);
    });

    it("should handle malformed API response", async () => {
        fetchMock.mockImplementation((url) => {
            if (url.host === "pro-api.coinmarketcap.com") {
                return new Response(JSON.stringify({
                    data: {
                        WBTC: {
                            quote: {
                                USDC: {
                                    // Missing required fields
                                    price: 50000.0
                                }
                            }
                        }
                    }
                }));
            }
            return new Response('Unknown request');
        });

        const oracleProgram = await file(WASM_PATH).arrayBuffer();
        const vmResult = await testOracleProgramExecution(
            Buffer.from(oracleProgram),
            Buffer.from(""),
            fetchMock
        );

        expect(vmResult.exitCode).toBe(1);
    });
});

describe("WBTC/USDC LTV Oracle - Tally Phase", () => {
    it("should calculate the median LTV from multiple reveals", async () => {
        const oracleProgram = await file(WASM_PATH).arrayBuffer();

        function createRevealBuffer(value: number): Buffer {
            const buf = Buffer.alloc(8);
            buf.writeBigUInt64LE(BigInt(value));
            return buf;
        }

        // Simulate different nodes reporting slightly different LTVs
        const reveals = [
            {
                exitCode: 0,
                gasUsed: 0,
                inConsensus: true,
                result: createRevealBuffer(72), // Node 1
            },
            {
                exitCode: 0,
                gasUsed: 0,
                inConsensus: true,
                result: createRevealBuffer(71), // Node 2
            },
            {
                exitCode: 0,
                gasUsed: 0,
                inConsensus: true,
                result: createRevealBuffer(73), // Node 3
            }
        ];

        const vmResult = await testOracleProgramTally(
            Buffer.from(oracleProgram),
            Buffer.from(""),
            reveals
        );

        expect(vmResult.exitCode).toBe(0);
        const result = Buffer.from(vmResult.result).readBigUInt64LE();
        expect(Number(result)).toBe(72); // Median of 71, 72, 73
    });

    it("should handle empty reveals", async () => {
        const oracleProgram = await file(WASM_PATH).arrayBuffer();

        const vmResult = await testOracleProgramTally(
            Buffer.from(oracleProgram),
            Buffer.from(""),
            [] // Empty reveals
        );

        expect(vmResult.exitCode).toBe(1); // Error exit code
    });

    it("should handle invalid reveal data", async () => {
        const oracleProgram = await file(WASM_PATH).arrayBuffer();

        const reveals = [
            {
                exitCode: 0,
                gasUsed: 0,
                inConsensus: true,
                result: Buffer.from([1, 2, 3]), // Invalid data (not 8 bytes)
            }
        ];

        const vmResult = await testOracleProgramTally(
            Buffer.from(oracleProgram),
            Buffer.from(""),
            reveals
        );

        expect(vmResult.exitCode).toBe(1); // Should fail with invalid data
    });

    it("should handle extreme outlier values", async () => {
        const oracleProgram = await file(WASM_PATH).arrayBuffer();

        function createRevealBuffer(value: number): Buffer {
            const buf = Buffer.alloc(8);
            buf.writeBigUInt64LE(BigInt(value));
            return buf;
        }

        const reveals = [
            {
                exitCode: 0,
                gasUsed: 0,
                inConsensus: true,
                result: createRevealBuffer(72), // Normal value
            },
            {
                exitCode: 0,
                gasUsed: 0,
                inConsensus: true,
                result: createRevealBuffer(90), // Extreme outlier
            },
            {
                exitCode: 0,
                gasUsed: 0,
                inConsensus: true,
                result: createRevealBuffer(73), // Normal value
            }
        ];

        const vmResult = await testOracleProgramTally(
            Buffer.from(oracleProgram),
            Buffer.from(""),
            reveals
        );

        expect(vmResult.exitCode).toBe(0);
        const result = Buffer.from(vmResult.result).readBigUInt64LE();
        expect(Number(result)).toBe(73); // Median of 72, 73, 90
    });

    it("should handle mixed consensus status", async () => {
        const oracleProgram = await file(WASM_PATH).arrayBuffer();

        function createRevealBuffer(value: number): Buffer {
            const buf = Buffer.alloc(8);
            buf.writeBigUInt64LE(BigInt(value));
            return buf;
        }

        const reveals = [
            {
                exitCode: 0,
                gasUsed: 0,
                inConsensus: true,
                result: createRevealBuffer(72),
            },
            {
                exitCode: 0,
                gasUsed: 0,
                inConsensus: false, // Not in consensus
                result: createRevealBuffer(90),
            },
            {
                exitCode: 0,
                gasUsed: 0,
                inConsensus: true,
                result: createRevealBuffer(73),
            }
        ];

        const vmResult = await testOracleProgramTally(
            Buffer.from(oracleProgram),
            Buffer.from(""),
            reveals
        );

        expect(vmResult.exitCode).toBe(0);
        const result = Buffer.from(vmResult.result).readBigUInt64LE();
        expect(Number(result)).toBe(72); // Median of 72, 73
    });
}); 