import { Signer, buildSigningConfig } from '@seda-protocol/dev-tools';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { QueryClient, setupBankExtension } from '@cosmjs/stargate';
import { Tendermint34Client } from '@cosmjs/tendermint-rpc';

async function main() {
    try {
        const signingConfig = buildSigningConfig({});
        const signer = await Signer.fromPartial(signingConfig);

        const address = await signer.getAddress();
        console.log('Wallet address:', address);

        // Connect to the RPC endpoint
        const tmClient = await Tendermint34Client.connect(process.env.SEDA_RPC_ENDPOINT || 'https://rpc.testnet.seda.xyz/');
        const queryClient = QueryClient.withExtensions(tmClient, setupBankExtension);

        // Query the balance
        const balance = await queryClient.bank.balance(address, 'aseda');
        console.log('Balance:', balance.amount, 'aseda');
    } catch (error) {
        console.error('Failed to check balance:', error);
        throw error;
    }
}

main().catch(console.error); 