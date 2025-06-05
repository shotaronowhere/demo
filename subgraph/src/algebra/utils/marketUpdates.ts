import { Market, MarketDayData, Token, MarketHourData } from '../../../generated/schema'
import { ethereum, BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { ZERO_BD, ZERO_BI } from './constants'

export function updateMarketDayData(market: Market, event: ethereum.Event): MarketDayData {
    let timestamp = event.block.timestamp.toI32()
    let dayID = timestamp / 86400
    let dayStartTimestamp = dayID * 86400
    let marketDayDataID = market.id.concat('-').concat(BigInt.fromI32(dayID).toString())

    let marketDayData = MarketDayData.load(marketDayDataID)
    if (marketDayData === null) {
        marketDayData = new MarketDayData(marketDayDataID)
        marketDayData.date = dayStartTimestamp
        marketDayData.market = market.id
        marketDayData.volume = ZERO_BD
        marketDayData.volumeUSD = ZERO_BD
        marketDayData.untrackedVolumeUSD = ZERO_BD
        marketDayData.totalValueLockedUSD = ZERO_BD
        marketDayData.totalValueLockedUSDUntracked = ZERO_BD
    }
    // Update TVL and Volume from the market entity itself as it's cumulative
    marketDayData.totalValueLockedUSD = market.totalValueLockedUSD
    marketDayData.totalValueLockedUSDUntracked = market.totalValueLockedUSDUntracked
    marketDayData.volume = market.volume
    marketDayData.volumeUSD = market.volumeUSD
    marketDayData.untrackedVolumeUSD = market.untrackedVolumeUSD

    marketDayData.save()
    return marketDayData as MarketDayData
}

export function updateMarketHourData(market: Market, event: ethereum.Event): MarketHourData {
    let timestamp = event.block.timestamp.toI32()
    let hourIndex = timestamp / 3600 // get current hour within a day
    let hourStartUnix = hourIndex * 3600
    let marketHourDataID = market.id.concat('-').concat(BigInt.fromI32(hourIndex).toString())

    let marketHourData = MarketHourData.load(marketHourDataID)
    if (marketHourData === null) {
        marketHourData = new MarketHourData(marketHourDataID)
        marketHourData.periodStartUnix = hourStartUnix
        marketHourData.market = market.id
        marketHourData.volume = ZERO_BD
        marketHourData.volumeUSD = ZERO_BD
        marketHourData.untrackedVolumeUSD = ZERO_BD
        marketHourData.totalValueLockedUSD = ZERO_BD
        marketHourData.totalValueLockedUSDUntracked = ZERO_BD
    }
    // Update TVL and Volume from the market entity itself as it's cumulative
    marketHourData.totalValueLockedUSD = market.totalValueLockedUSD
    marketHourData.totalValueLockedUSDUntracked = market.totalValueLockedUSDUntracked
    marketHourData.volume = market.volume
    marketHourData.volumeUSD = market.volumeUSD
    marketHourData.untrackedVolumeUSD = market.untrackedVolumeUSD

    marketHourData.save()
    return marketHourData as MarketHourData
} 