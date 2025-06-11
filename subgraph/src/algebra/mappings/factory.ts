import { WHITELIST_TOKENS } from './../utils/pricing'
/* eslint-disable prefer-const */
import { FACTORY_ADDRESS, ZERO_BI, ONE_BI, ZERO_BD, ADDRESS_ZERO, pools_list, SDAI_ADDRESS, WXDAI_ADDRESS } from './../utils/constants'
import { Factory, Market } from '../../../generated/schema'
import { Pool as PoolEvent } from '../../../generated/Factory/Factory'
import { DefaultCommunityFee } from '../../../generated/Factory/Factory'
import { Pool, Token } from '../../../generated/schema'
import { Pool as PoolTemplate } from '../../../generated/templates'
import { fetchTokenSymbol, fetchTokenName, fetchTokenTotalSupply, fetchTokenDecimals } from '../utils/token'
import { log, BigInt, Address } from '@graphprotocol/graph-ts'
import { createTokenEntity } from '../../algebra-farming/utils/token'

export function handlePoolCreated(event: PoolEvent): void {

  let token0_address = event.params.token0
  let token1_address = event.params.token1

  let token0 = Token.load(token0_address.toHexString())
  let token1 = Token.load(token1_address.toHexString())

  // create wxdai or sdai if they are not registered

  if (token0 === null && (token0_address.toHexString() === WXDAI_ADDRESS || token0_address.toHexString() === SDAI_ADDRESS)) {
    let success = createTokenEntity(token0_address, false, Address.fromString(ADDRESS_ZERO))
    if (!success) {
      log.error('mybug the token was null', [])
      return
    }
  }

  if (token1 === null && (token1_address.toHexString() === WXDAI_ADDRESS || token1_address.toHexString() === SDAI_ADDRESS)) {
    let success = createTokenEntity(token1_address, false, Address.fromString(ADDRESS_ZERO))
    if (!success) {
      log.error('mybug the token was null', [])
      return
    }
  }

  token0 = Token.load(token0_address.toHexString())
  token1 = Token.load(token1_address.toHexString())

  if (!token0 || !token1) {
    return
  }

  if (!(token0.isSeer || token1.isSeer)) {
    return
  }

  // temp fix
  // load factory
  let factory = Factory.load(FACTORY_ADDRESS)
  if (factory == null) {
    factory = new Factory(FACTORY_ADDRESS)
    factory.poolCount = ZERO_BI
    factory.totalVolumeMatic = ZERO_BD
    factory.totalVolumeUSD = ZERO_BD
    factory.untrackedVolumeUSD = ZERO_BD
    factory.totalFeesUSD = ZERO_BD
    factory.totalFeesMatic = ZERO_BD
    factory.totalValueLockedMatic = ZERO_BD
    factory.totalValueLockedUSD = ZERO_BD
    factory.totalValueLockedUSDUntracked = ZERO_BD
    factory.totalValueLockedMaticUntracked = ZERO_BD
    factory.txCount = ZERO_BI
    factory.owner = ADDRESS_ZERO
    factory.defaultCommunityFee = BigInt.fromI32(0)
  }

  factory.poolCount = factory.poolCount.plus(ONE_BI)

  let pool = new Pool(event.params.pool.toHexString()) as Pool

  if (pools_list.includes(event.params.pool.toHexString())) {
    token0 = Token.load(event.params.token1.toHexString())
    token1 = Token.load(event.params.token0.toHexString())
    token0_address = event.params.token1
    token1_address = event.params.token0
  }
  // load markets from tokens
  pool.market0 = token0!.market ? token0!.market : token1!.market

  // atleast one market should exist
  let market0 = Market.load(pool.market0!)
  if (market0!.collateralToken === token0!.id) {
    token1!.poolCollateral = pool.id
  } else if (market0!.collateralToken === token1!.id) {
    token0!.poolCollateral = pool.id
  }

  // cannonical ordering of markets
  if (token1!.market !== null && token0!.market !== null) {
    let market1 = Market.load(token1!.market!)

    if (market0 !== null && market1 !== null) {
      // check if one market is child of the other
      // make parent market0
      if (market0.parentMarket === market1.id) {
        pool.market0 = market1.id
        pool.market1 = market0.id
      } else if (market1.parentMarket === market0.id) {
        pool.market0 = market0.id
        pool.market1 = market1.id
      } else if (market0.id === market1.id) {
        pool.market0 = market0.id
        // don't duplicate market
      } else {
        pool.market0 = market0.id
        pool.market1 = market1.id
      }
    }
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
    factory.untrackedVolumeUSD = ZERO_BD
    factory.totalFeesUSD = ZERO_BD
    factory.totalFeesMatic = ZERO_BD
    factory.totalValueLockedMatic = ZERO_BD
    factory.totalValueLockedUSD = ZERO_BD
    factory.totalValueLockedUSDUntracked = ZERO_BD
    factory.totalValueLockedMaticUntracked = ZERO_BD
    factory.txCount = ZERO_BI
    factory.owner = ADDRESS_ZERO
  }
  factory.defaultCommunityFee = BigInt.fromI32(event.params.newDefaultCommunityFee as i32)
  factory.save()
}