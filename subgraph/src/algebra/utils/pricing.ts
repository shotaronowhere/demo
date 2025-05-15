/* eslint-disable prefer-const */
import { ONE_BD, ZERO_BD, ZERO_BI } from './constants'
import { Bundle, Pool, Token } from '../../../generated/schema'
import { Address, BigDecimal, BigInt, ethereum } from '@graphprotocol/graph-ts'
import { exponentToBigDecimal, safeDiv } from '../utils/index'
// import sdai abi generated
import { Sdai } from '../../../generated/Factory/Sdai'
const WMatic_ADDRESS = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d'
const sdai = '0xaf204776c7245bf4147c2612bf6e5972ee483701'
const USDC_WMatic_03_POOL = '0x308c5b91f63307439fdb51a9fa4dfc979e2ed6b0'

// token where amounts should contribute to tracked volume and liquidity
// usually tokens that many tokens are paired with 
// s
export let WHITELIST_TOKENS: string[] = [
  '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1', // WETH
  '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', // WXDAI
  '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb', // GNO 
  '0x8e5bBbb09Ed1ebdE8674Cda39A0c169401db4252', // WBTC
  '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83', // USDC
  '0x1e2c4fb7ede391d116e6b41cd0608260e8801d59', // bCSPX
  '0xaf204776c7245bf4147c2612bf6e5972ee483701'  // sdai
]

let MINIMUM_Matic_LOCKED = BigDecimal.fromString('0')

let Q192 = Math.pow(2, 192)

let STABLE_COINS: string[] = [
  '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83', // USDC
  '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', // wxdai
]


export function priceToTokenPrices(price: BigInt, token0: Token, token1: Token): BigDecimal[] {
  let num = price.times(price).toBigDecimal()
  let denom = BigDecimal.fromString(Q192.toString())
  let price1 = num
    .div(denom)
    .times(exponentToBigDecimal(token0.decimals))
    .div(exponentToBigDecimal(token1.decimals))

  let price0 = safeDiv(BigDecimal.fromString('1'), price1)
  return [price0, price1]
}

export function getEthPriceInUSD(): BigDecimal {
  return ONE_BD // hardcode xdai as 1:1 with USD
}


/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived Matic (add stablecoin estimates)
 **/
export function findEthPerToken(token: Token, block: ethereum.Block): BigDecimal {
  if (token.id == WMatic_ADDRESS) {
    return ONE_BD
  }
  if (token.id == sdai) {
    if (block.number.lt(BigInt.fromString('30195209'))) {
      return BigDecimal.fromString('1')
    }
    // call sdai contract to get price
    let sdaiContract = Sdai.bind(Address.fromString(sdai))
    let price = sdaiContract.convertToAssets(BigInt.fromString('1000000000000000000'))

    // convert to decimal
    return price.toBigDecimal().div(BigDecimal.fromString('1000000000000000000'))
  }
  let whiteList = token.whitelistPools
  // for now just take USD from pool with greatest TVL
  // need to update this to actually detect best rate based on liquidity distribution
  let largestLiquidityMatic = ZERO_BD
  let priceSoFar = ZERO_BD
  let bundle = Bundle.load('1')

  // hardcoded fix for incorrect rates
  // if whitelist includes token - get the safe price
  if (STABLE_COINS.includes(token.id)) {
    priceSoFar = safeDiv(ONE_BD, bundle!.maticPriceUSD)
  } else {
    for (let i = 0; i < whiteList.length; ++i) {
      let poolAddress = whiteList[i]
      let pool = Pool.load(poolAddress)!
      if (pool.liquidity.gt(ZERO_BI)) {

        if (pool.token0 == token.id) {
          // whitelist token is token1
          let token1 = Token.load(pool.token1)!
          // get the derived Matic in pool
          let maticLocked = pool.totalValueLockedToken1.times(token1.derivedMatic)
          if (maticLocked.gt(largestLiquidityMatic) && maticLocked.gt(MINIMUM_Matic_LOCKED)) {
            largestLiquidityMatic = maticLocked
            // token1 per our token * Eth per token1
            priceSoFar = pool.token1Price.times(token1.derivedMatic as BigDecimal)
          }
        }
        if (pool.token1 == token.id) {
          let token0 = Token.load(pool.token0)!
          // get the derived Matic in pool
          let maticLocked = pool.totalValueLockedToken0.times(token0.derivedMatic)
          if (maticLocked.gt(largestLiquidityMatic) && maticLocked.gt(MINIMUM_Matic_LOCKED)) {
            largestLiquidityMatic = maticLocked
            // token0 per our token * Matic per token0
            priceSoFar = pool.token0Price.times(token0.derivedMatic as BigDecimal)
          }
        }
      }
    }
  }
  return priceSoFar // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedAmountUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')!
  let price0USD = token0.derivedMatic.times(bundle.maticPriceUSD)
  let price1USD = token1.derivedMatic.times(bundle.maticPriceUSD)

  // both are whitelist tokens, return sum of both amounts
  if (WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount0.times(price0USD).plus(tokenAmount1.times(price1USD))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST_TOKENS.includes(token0.id) && !WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount0.times(price0USD).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST_TOKENS.includes(token0.id) && WHITELIST_TOKENS.includes(token1.id)) {
    return tokenAmount1.times(price1USD).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked amount is 0
  return ZERO_BD
}
