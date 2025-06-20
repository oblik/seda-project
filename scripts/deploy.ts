import { Signer, buildSigningConfig, postAndAwaitDataRequest } from '@seda-protocol/dev-tools';
import { readFileSync } from "fs";

async function deploy() {
    try {
        // Create signer using SEDA SDK with default config
        const signingConfig = buildSigningConfig({});
        const signer = await Signer.fromPartial(signingConfig);
        console.log("Created signer successfully");

        // Read the WASM binary
        const wasmBinary = readFileSync(
            "./target/wasm32-wasip1/release-wasm/oracle-program.wasm"
        );

        console.log("Uploading Oracle Program...");

        // Upload the Oracle Program using the signer's default configuration
        const result = await signer.uploadProgram(wasmBinary);

        console.log("Upload successful!");
        console.log("Oracle Program ID:", result);
    } catch (error) {
        console.error("Deployment failed:", error.message);
        throw error;
    }
}

deploy().catch(console.error); 