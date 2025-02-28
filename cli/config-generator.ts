import { readFileSync, writeFileSync, existsSync } from 'fs';
import YAML from 'yaml';


interface RouteHop {
  contractAddress: string;
  quoterV2: string;
  tokenOut: string;
}

interface UniswapRouteConfig {
  chainName: string;
  fromToken: string;
  toToken: string;
}

/**
 * Generates a single route entry (JS object) under `routers[routeKey]`.
 */
function buildUniswapV3Route(
  routeConfig: UniswapRouteConfig,
  swaps: RouteHop[]
): Record<string, any> {
  const maxAmountSlippageMultiplier = '1.015';
  const method = 'swapExactOutWithQuoteIn';
  const extraDustWei = '4';
  swaps = swaps.map((swap) => {
    return {
      contractType: 'univ3pool',
      contractAddress: swap.contractAddress,
      quoterV2: swap.quoterV2,
      tokenOut: swap.tokenOut,
    };
  });

  return {
    maxAmountSlippageMultiplier,
    implementationArgs: {
      method,
      extraDustWei,
      swaps,
    },
  };
}

/**
 * Accepts multiple (routeConfig, swaps) pairs, merges them under a single
 * `routers:` object, and returns the YAML as a string.
 */
function generateCombinedRoutes(
  existingRoutes: any,
  routeData: { config: UniswapRouteConfig; swaps: RouteHop[] }[]
): string {
  // If `existingRoutes` is empty or doesn't have `.routers`, initialize it
  if (!existingRoutes || typeof existingRoutes !== 'object') {
    existingRoutes = { routers: {} };
  }
  if (!existingRoutes.routers) {
    existingRoutes.routers = {};
  }

  // Merge each route's config in
  for (const { config, swaps } of routeData) {
    const routeKey = `${config.chainName}/${config.fromToken}/${config.toToken}`;
    existingRoutes.routers[routeKey] = buildUniswapV3Route(config, swaps);
  }

  // Convert the merged object to YAML
  return YAML.stringify(existingRoutes);
}

/**
 *  1) Reads the existing YAML (if it exists),
 *  2) Updates (or adds) the specified route(s),
 *  3) Writes the merged result back to `config_generated.yaml`.
 */
export function generateConfig(
  poolsAddresses: string[],
  tokenSymbols: string[],
  chainName: string,
  quoterV2: string
) {
  if (poolsAddresses.length !== tokenSymbols.length - 1) {
    throw new Error('Invalid input: poolsAddresses.length !== tokenSymbols.length - 1');
  }
  if (poolsAddresses.length === 0) {
    throw new Error('Invalid input: poolsAddresses.length === 0');
  }

  // Build a single routeConfig
  const routeConfig: UniswapRouteConfig = {
    chainName,
    fromToken: tokenSymbols[0] as string,
    toToken: tokenSymbols[tokenSymbols.length - 1] as string,
  };

  // Construct the list of swaps
  const swaps: RouteHop[] = [];
  for (let i = 0; i < poolsAddresses.length; i++) {
    swaps.push({
      contractAddress: poolsAddresses[i] as string,
      quoterV2,
      tokenOut: tokenSymbols[i + 1] as string,
    });
  }

  // 1) Read existing YAML config if it exists
  let existingConfig: any = {};
  const filePath = 'config_generated.yaml';
  if (existsSync(filePath)) {
    const fileContent = readFileSync(filePath, 'utf-8');
    if (fileContent.trim()) {
      existingConfig = YAML.parse(fileContent);
    }
  }

  // 2) Merge in the new route data
  const yamlOutput = generateCombinedRoutes(existingConfig, [
    { config: routeConfig, swaps },
  ]);

  // 3) Write the merged config back
  writeFileSync(filePath, yamlOutput, 'utf-8');
}
