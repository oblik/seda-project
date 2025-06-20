import { Signer, buildSigningConfig, postDataRequest } from '@seda-protocol/dev-tools';
import { Tendermint34Client } from '@cosmjs/tendermint-rpc';
import { QueryClient, setupBankExtension } from '@cosmjs/stargate';

async function main() {
    if (!process.env.ORACLE_PROGRAM_ID) {
        throw new Error('Please set the ORACLE_PROGRAM_ID in your env file');
    }

    try {
        // Connect to the RPC endpoint first
        console.log('Connecting to RPC endpoint...');
        const tmClient = await Tendermint34Client.connect('https://rpc.testnet.seda.xyz/');
        const queryClient = QueryClient.withExtensions(tmClient, setupBankExtension);
        console.log('Connected to RPC endpoint successfully');

        // Create signer with complete configuration
        const signerConfig = buildSigningConfig({
            chainId: "seda-testnet-1",
            rpcEndpoint: "https://rpc.testnet.seda.xyz/",
            gasPrice: "0.1aseda",
            gasAdjustment: 1.5,
            MinFeeRateNanosPerKB: 1000
        });
        console.log('Signer configuration:', signerConfig);

        const signer = await Signer.fromPartial(signerConfig);
        console.log('Created signer successfully');

        const address = await signer.getAddress();
        console.log('Using address:', address);

        // Check balance before proceeding
        const balance = await queryClient.bank.balance(address, 'aseda');
        console.log('Current balance:', balance.amount, 'aseda');

        console.log('Posting data request...');
        console.log('Oracle Program ID:', process.env.ORACLE_PROGRAM_ID);

        const requestParams = {
            consensusOptions: {
                method: 'none'
            },
            execProgramId: process.env.ORACLE_PROGRAM_ID,
            execInputs: Buffer.from('BRENT'),
            tallyInputs: Buffer.from(''),
            memo: 'Brent Crude Oil Price Request',
            fee: {
                amount: [{
                    denom: "aseda",
                    amount: "25547500000000000"
                }],
                gas: "1000000",
                granter: undefined
            }
        };
        console.log('Request parameters:', JSON.stringify(requestParams, null, 2));

        const result = await postDataRequest(signer, requestParams);
        console.log('Raw result:', result);

        if (!result || (!result.tx && !result.dr)) {
            throw new Error('Transaction failed - no response received');
        }

        console.log('\nData request posted successfully!');
        console.log('Transaction hash:', result.tx);
        console.log('Data Request ID:', result.dr.id);
        console.log('Block height:', result.dr.height.toString());
    } catch (error) {
        console.error('Failed to post data request. Full error:', error);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        throw error;
    }
}

main().catch(console.error);