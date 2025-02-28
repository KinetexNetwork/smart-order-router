import { Logger } from '@ethersproject/logger';
import { flags } from '@oclif/command';
import { Protocol } from '@uniswap/router-sdk';
import { Currency, Percent, TradeType } from '@uniswap/sdk-core';
import dotenv from 'dotenv';
import _ from 'lodash';

import {
    ID_TO_CHAIN_ID,
    MapWithLowerCaseKey,
    nativeOnChain,
    parseAmount,
    SwapRoute,
    SwapType
} from '../../src';
import { NATIVE_NAMES_BY_ID, TO_PROTOCOL } from '../../src/util';
import { BaseCommand } from '../base-command';
import { UniversalRouterVersion } from '@uniswap/universal-router-sdk';
import { Pool as V3Pool } from '@uniswap/v3-sdk';
import {
    routeToPools,
    routeToTokens,
    routeToString
} from '../../src';
import { generateConfig } from '../config-generator';

dotenv.config();

Logger.globalLogger();
Logger.setLogLevel(Logger.levels.DEBUG);

interface Chain {
    chainId: number;
    chainName: string;
    quoterAddress: string;
    chainTokens: { address: string, quoteAmount: string }[];
}

//todo: import from chaindata
const chains: Chain[] = [
    {
        chainId: 1,
        chainName: "mainnet",
        quoterAddress: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
        chainTokens: [
            { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", quoteAmount: "4" }, // WETH
            { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", quoteAmount: "10000" }, // USDC
        ]
    },
    {
        chainId: 8453,
        chainName: "base",
        quoterAddress: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
        chainTokens: [
            { address: "0x4200000000000000000000000000000000000006", quoteAmount: "4" }, // WETH
            { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", quoteAmount: "10000" }, // USDC
        ]
    }
]


export class Generate extends BaseCommand {
    static description = 'Uniswap Smart Order Router CLI';

    static flags = {
        ...BaseCommand.flags,
        version: flags.version({ char: 'v' }),
        help: flags.help({ char: 'h' }),
        tokenIn: flags.string({ char: 'i', required: false }),
        tokenOut: flags.string({ char: 'o', required: true }),
        recipient: flags.string({ required: false }),
        amount: flags.string({ char: 'a', required: false }),
        exactIn: flags.boolean({ required: false }),
        exactOut: flags.boolean({ required: false }),
        protocols: flags.string({ required: false }),
        forceCrossProtocol: flags.boolean({ required: false, default: false }),
        forceMixedRoutes: flags.boolean({
            required: false,
            default: false,
        }),
        simulate: flags.boolean({ required: false, default: false }),
        debugRouting: flags.boolean({ required: false, default: true }),
        enableFeeOnTransferFeeFetching: flags.boolean({ required: false, default: false }),
        requestBlockNumber: flags.integer({ required: false }),
        gasToken: flags.string({ required: false }),
    };

    async run() {
        const { flags } = this.parse(Generate);
        const {
            tokenIn: tokenInStr,
            tokenOut: tokenOutStr,
            amount: amountStr,
            topNSecondHopForTokenAddressRaw,
            chainId: chainIdNumb,
        } = flags;

        const topNSecondHopForTokenAddress = new MapWithLowerCaseKey();
        topNSecondHopForTokenAddressRaw.split(',').forEach((entry) => {
            if (entry != '') {
                const entryParts = entry.split('|');
                if (entryParts.length != 2) {
                    throw new Error(
                        'flag --topNSecondHopForTokenAddressRaw must be in format tokenAddress|topN,...');
                }
                const topNForTokenAddress: number = Number(entryParts[1]!);
                topNSecondHopForTokenAddress.set(entryParts[0]!, topNForTokenAddress);
            }
        });

        const tokenProvider = this.tokenProvider;
        const fromTokens = chains.find(chain => chain.chainId === chainIdNumb)!.chainTokens;
        const tokensIn = !tokenInStr ? fromTokens : [{ address: tokenInStr, quoteAmount: amountStr }];
        const tokenOut: Currency = (await tokenProvider.getTokens([tokenOutStr]))
            .getTokenByAddress(tokenOutStr)!;

        for (const token of tokensIn) {
            const tokenIn: Currency = (await tokenProvider.getTokens([token.address]))
                .getTokenByAddress(token.address)!;

            await this.generateConfig(tokenIn, tokenOut, token.quoteAmount!);
        }
    }


    async generateConfig(tokenIn: Currency, tokenOut: Currency, amount: string) {
        const { flags } = this.parse(Generate);
        const {
            exactIn,
            exactOut,
            recipient,
            debug,
            topN,
            topNTokenInOut,
            topNSecondHop,
            topNSecondHopForTokenAddressRaw,
            topNWithEachBaseToken,
            topNWithBaseToken,
            topNWithBaseTokenInSet,
            topNDirectSwaps,
            maxSwapsPerPath,
            minSplits,
            maxSplits,
            distributionPercent,
            chainId: chainIdNumb,
            protocols: protocolsStr,
            forceCrossProtocol,
            forceMixedRoutes,
            simulate,
            debugRouting,
            enableFeeOnTransferFeeFetching,
            requestBlockNumber,
            gasToken
        } = flags;

        let swapRoutes: SwapRoute | null;
        const log = this.logger;
        const router = this.router;

        //only v3 for now
        let protocols: Protocol[] = [TO_PROTOCOL('v3')];

        //assuming always exactIn
        const amountIn = parseAmount(amount, tokenIn);
        swapRoutes = await router.route(
            amountIn,
            tokenOut,
            TradeType.EXACT_INPUT,
            recipient
                ? {
                    type: SwapType.UNIVERSAL_ROUTER,
                    deadlineOrPreviousBlockhash: 10000000000000,
                    recipient,
                    slippageTolerance: new Percent(5, 100),
                    simulate: simulate ? { fromAddress: recipient } : undefined,
                    version: UniversalRouterVersion.V2_0
                }
                : undefined,
            {
                blockNumber: this.blockNumber,
                v3PoolSelection: {
                },
                maxSwapsPerPath,
                minSplits,
                maxSplits,
                distributionPercent,
                protocols,
                forceCrossProtocol,
                forceMixedRoutes,
                debugRouting,
                enableFeeOnTransferFeeFetching,
                gasToken
            }
        );

        if (!swapRoutes) {
            log.error(
                `Could not find route. ${debug ? '' : 'Run in debug mode for more info'
                }.`
            );
            return;
        }

        const {
            route: routeAmounts,
        } = swapRoutes;

        const bestQuote = _.maxBy(routeAmounts, ({ amount }) => amount.toExact())!
        const pools = routeToPools(bestQuote.route);
        const poolsAddresses = pools.map(pool => {
            if (pool instanceof V3Pool) {
                //todo: factoryAddress
                return V3Pool.getAddress(pool.token0, pool.token1, pool.fee, undefined);
            }
            else {
                throw new Error(`Unsupported pool ${JSON.stringify(pool)}`);
            }
        });
        const tokens = routeToTokens(bestQuote.route);

        this.logger.info(`Best route:`);
        this.logger.info(`${routeToString(bestQuote.route)}`);

        const chainInfo = chains.find(chain => chain.chainId === chainIdNumb)!;

        generateConfig(
            poolsAddresses,
            tokens.map(token => token.symbol ?? ''),
            chainInfo.chainName,
            chainInfo.quoterAddress
        );
    }
}


