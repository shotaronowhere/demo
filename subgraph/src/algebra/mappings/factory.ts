import { WHITELIST_TOKENS } from './../utils/pricing'
/* eslint-disable prefer-const */
import { FACTORY_ADDRESS, ZERO_BI, ONE_BI, ZERO_BD, ADDRESS_ZERO, pools_list } from './../utils/constants'
import { Factory } from '../../../generated/schema'
import { Pool as PoolEvent } from '../../../generated/Factory/Factory'
import { DefaultCommunityFee } from '../../../generated/Factory/Factory'
import { Pool, Token, Bundle } from '../../../generated/schema'
import { Pool as PoolTemplate } from '../../../generated/templates'
import { fetchTokenSymbol, fetchTokenName, fetchTokenTotalSupply, fetchTokenDecimals } from '../utils/token'
import { log, BigInt, Address } from '@graphprotocol/graph-ts'

function newToken(token_address: Address): Token | null {
  let token = new Token(token_address.toHexString())
  token.symbol = fetchTokenSymbol(token_address)
  token.name = fetchTokenName(token_address)
  token.totalSupply = fetchTokenTotalSupply(token_address)
  let decimals = fetchTokenDecimals(token_address)

  // bail if we couldn't figure out the decimals
  if (decimals === null) {
    log.debug('mybug the decimal on token 0 was null', [])
    return null
  }

  token.decimals = decimals
  token.derivedMatic = ZERO_BD
  token.volume = ZERO_BD
  token.volumeUSD = ZERO_BD
  token.feesUSD = ZERO_BD
  token.untrackedVolumeUSD = ZERO_BD
  token.totalValueLocked = ZERO_BD
  token.totalValueLockedUSD = ZERO_BD
  token.totalValueLockedUSDUntracked = ZERO_BD
  token.txCount = ZERO_BI
  token.poolCount = ZERO_BI
  token.whitelistPools = []
  token.isSeer = false
  token.save()
  return token
}

export function handlePoolCreated(event: PoolEvent): void {

  let token0_address = event.params.token0
  let token1_address = event.params.token1

  let token0 = Token.load(token0_address.toHexString())
  let token1 = Token.load(token1_address.toHexString())

  // only tracke whitelist - whitelist pools or seer tokens
  if (!token0 && WHITELIST_TOKENS.includes(token0_address.toHexString())) {
    token0 = newToken(token0_address)
  }
  if (!token1 && WHITELIST_TOKENS.includes(token1_address.toHexString())) {
    token1 = newToken(token1_address)
  }

  // either both tokens are whitelisted or atleast 1 token must be a seer token
  if (!token0 && !token1) {
    return
  }

  if (!token0) {
    token0 = newToken(token0_address)
    if (token0 === null) {
      return
    }
  }
  if (!token1) {
    token1 = newToken(token1_address)
    if (token1 === null) {
      return
    }
  }

  // temp fix
  // load factory
  let factory = Factory.load(FACTORY_ADDRESS)
  if (factory == null) {
    factory = new Factory(FACTORY_ADDRESS)
    factory.poolCount = ZERO_BI
    factory.totalVolumeMatic = ZERO_BD
    factory.totalVolumeUSD = ZERO_BD
    factory.totalSeerVolumeUSD = ZERO_BD
    factory.totalSeerVolumeMatic = ZERO_BD
    factory.untrackedVolumeUSD = ZERO_BD
    factory.totalFeesUSD = ZERO_BD
    factory.totalSeerFeesUSD = ZERO_BD
    factory.totalFeesMatic = ZERO_BD
    factory.totalSeerFeesMatic = ZERO_BD
    factory.totalValueLockedMatic = ZERO_BD
    factory.totalSeerValueLockedMatic = ZERO_BD
    factory.totalValueLockedUSD = ZERO_BD
    factory.totalSeerValueLockedUSD = ZERO_BD
    factory.totalValueLockedUSDUntracked = ZERO_BD
    factory.totalValueLockedMaticUntracked = ZERO_BD
    factory.txCount = ZERO_BI
    factory.owner = ADDRESS_ZERO
    factory.defaultCommunityFee = BigInt.fromI32(0)

    // create new bundle for tracking matic price
    let bundle = new Bundle('1')
    bundle.maticPriceUSD = ZERO_BD
    bundle.save()
  }

  factory.poolCount = factory.poolCount.plus(ONE_BI)

  let pool = new Pool(event.params.pool.toHexString()) as Pool

  if (pools_list.includes(event.params.pool.toHexString())) {
    token0 = Token.load(event.params.token1.toHexString())
    token1 = Token.load(event.params.token0.toHexString())
    token0_address = event.params.token1
    token1_address = event.params.token0
  }


  // update white listed pools
  if (WHITELIST_TOKENS.includes(token0!.id)) {
    let newPools = token1!.whitelistPools
    newPools.push(pool.id)
    token1!.whitelistPools = newPools
  }
  if (WHITELIST_TOKENS.includes(token1!.id)) {
    let newPools = token0!.whitelistPools
    newPools.push(pool.id)
    token0!.whitelistPools = newPools
  }

  pool.token0 = token0!.id
  pool.token1 = token1!.id
  pool.fee = BigInt.fromI32(100)
  pool.createdAtTimestamp = event.block.timestamp
  pool.createdAtBlockNumber = event.block.number
  pool.liquidityProviderCount = ZERO_BI
  pool.tickSpacing = BigInt.fromI32(60)
  pool.txCount = ZERO_BI
  pool.liquidity = ZERO_BI
  pool.sqrtPrice = ZERO_BI
  pool.feeGrowthGlobal0X128 = ZERO_BI
  pool.feeGrowthGlobal1X128 = ZERO_BI
  pool.communityFee0 = factory.defaultCommunityFee
  pool.communityFee1 = factory.defaultCommunityFee
  pool.token0Price = ZERO_BD
  pool.token1Price = ZERO_BD
  pool.observationIndex = ZERO_BI
  pool.totalValueLockedToken0 = ZERO_BD
  pool.totalValueLockedToken1 = ZERO_BD
  pool.totalValueLockedUSD = ZERO_BD
  pool.totalValueLockedMatic = ZERO_BD
  pool.totalValueLockedUSDUntracked = ZERO_BD
  pool.volumeToken0 = ZERO_BD
  pool.volumeToken1 = ZERO_BD
  pool.volumeUSD = ZERO_BD
  pool.feesUSD = ZERO_BD
  pool.feesToken0 = ZERO_BD
  pool.feesToken1 = ZERO_BD
  pool.untrackedVolumeUSD = ZERO_BD
  pool.tick = ZERO_BI
  pool.untrackedFeesUSD = ZERO_BD
  pool.collectedFeesToken0 = ZERO_BD
  pool.collectedFeesToken1 = ZERO_BD
  pool.collectedFeesUSD = ZERO_BD

  pool.save()
  // create the tracked contract based on the template
  PoolTemplate.create(event.params.pool)
  token0!.save()
  token1!.save()
  factory.save()

}

export function handleDefaultCommFeeChange(event: DefaultCommunityFee): void {
  let factory = Factory.load(FACTORY_ADDRESS)
  if (factory == null) {
    factory = new Factory(FACTORY_ADDRESS)
    factory.poolCount = ZERO_BI
    factory.totalVolumeMatic = ZERO_BD
    factory.totalVolumeUSD = ZERO_BD
    factory.totalSeerVolumeMatic = ZERO_BD
    factory.untrackedVolumeUSD = ZERO_BD
    factory.totalFeesUSD = ZERO_BD
    factory.totalSeerFeesUSD = ZERO_BD
    factory.totalFeesMatic = ZERO_BD
    factory.totalSeerFeesMatic = ZERO_BD
    factory.totalValueLockedMatic = ZERO_BD
    factory.totalValueLockedUSD = ZERO_BD
    factory.totalSeerValueLockedMatic = ZERO_BD
    factory.totalSeerValueLockedUSD = ZERO_BD
    factory.totalValueLockedUSDUntracked = ZERO_BD
    factory.totalValueLockedMaticUntracked = ZERO_BD
    factory.txCount = ZERO_BI
    factory.owner = ADDRESS_ZERO

    // create new bundle for tracking matic price
    let bundle = new Bundle('1')
    bundle.maticPriceUSD = ZERO_BD
    bundle.save()
  }
  factory.defaultCommunityFee = BigInt.fromI32(event.params.newDefaultCommunityFee as i32)
  factory.save()
}