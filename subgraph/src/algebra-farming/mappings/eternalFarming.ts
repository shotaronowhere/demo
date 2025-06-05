import { ethereum, crypto, BigInt, Address, log } from '@graphprotocol/graph-ts';
import {
  EternalFarmingCreated,
  FarmEntered,
  FarmEnded,
  RewardClaimed,
  IncentiveDeactivated,
  RewardsRatesChanged,
  RewardsAdded,
  RewardAmountsDecreased,
  RewardsCollected
} from '../../../generated/EternalFarming/EternalFarming';
import { Deposit, Reward, EternalFarming, Pool, Position } from '../../../generated/schema';
import { createTokenEntity } from '../utils/token'
import { ADDRESS_ZERO, ZERO_BD } from '../../algebra/utils/constants';
import { EternalVirtualPool } from '../../../generated/EternalFarming/EternalVirtualPool';

const infinity = BigInt.fromString("18446744073709551615");

export function handleIncentiveCreated(event: EternalFarmingCreated): void {
  let incentiveIdTuple: Array<ethereum.Value> = [
    ethereum.Value.fromAddress(event.params.rewardToken),
    ethereum.Value.fromAddress(event.params.bonusRewardToken),
    ethereum.Value.fromAddress(event.params.pool),
    ethereum.Value.fromUnsignedBigInt(event.params.startTime),
    ethereum.Value.fromUnsignedBigInt(event.params.endTime)
  ];


  // load pool, make sure its not null
  let pool = Pool.load(event.params.pool.toHexString())
  if (pool === null) {
    return;
  }

  createTokenEntity(event.params.rewardToken, false, Address.fromString(ADDRESS_ZERO))
  createTokenEntity(event.params.bonusRewardToken, false, Address.fromString(ADDRESS_ZERO))
  createTokenEntity(event.params.multiplierToken, false, Address.fromString(ADDRESS_ZERO))

  let _incentiveTuple = changetype<ethereum.Tuple>(incentiveIdTuple);

  let incentiveIdEncoded = ethereum.encode(
    ethereum.Value.fromTuple(_incentiveTuple)
  )!;
  let incentiveId = crypto.keccak256(incentiveIdEncoded);

  let entity = EternalFarming.load(incentiveId.toHex());
  if (entity == null) {
    entity = new EternalFarming(incentiveId.toHex());
    entity.reward = BigInt.fromString("0");
    entity.rewardVirtual = BigInt.fromString("0");
    entity.bonusReward = BigInt.fromString("0");
    entity.rewardRate = BigInt.fromString("0");
    entity.bonusRewardRate = BigInt.fromString("0");
    entity.endTimeImplied = BigInt.fromString("0");
    entity.timestampActiveLiquidity = BigInt.fromString("0");
    entity.totalLiquidity = BigInt.fromString("0");
    entity.totalActiveLiquidity = BigInt.fromString("0");
  }
  entity.rewardToken = event.params.rewardToken;
  entity.bonusRewardToken = event.params.bonusRewardToken;
  entity.pool = event.params.pool.toHexString();
  entity.virtualPool = event.params.virtualPool;
  entity.startTime = event.params.startTime;
  entity.startTimeVirtual = event.params.startTime;
  entity.endTime = event.params.endTime;
  entity.endTimeImpliedVirtual = infinity;
  entity.isDetached = false;
  entity.minRangeLength = BigInt.fromI32(event.params.minimalAllowedPositionWidth)
  entity.tokenAmountForTier1 = event.params.tiers.tokenAmountForTier1;
  entity.tokenAmountForTier2 = event.params.tiers.tokenAmountForTier2;
  entity.tokenAmountForTier3 = event.params.tiers.tokenAmountForTier3;
  entity.tier1Multiplier = event.params.tiers.tier1Multiplier;
  entity.tier2Multiplier = event.params.tiers.tier2Multiplier;
  entity.tier3Multiplier = event.params.tiers.tier3Multiplier;
  entity.multiplierToken = event.params.multiplierToken;
  entity.save();
}


export function handleTokenStaked(event: FarmEntered): void {
  let entity = Deposit.load(event.params.tokenId.toString());
  if (entity != null) {
    entity.eternalFarming = event.params.incentiveId.toHexString();
    entity.enteredInEternalFarming = event.block.timestamp;
    entity.tokensLockedEternal = event.params.tokensLocked;
    entity.tierEternal = getTier(event.params.tokensLocked, event.params.incentiveId.toHexString())

    // CRITICAL FIX: Store the liquidity amount at the time of staking for this farm.
    // This 'entity.liquidity' (Deposit.liquidity) will now be the single source of truth 
    // for this specific farm participation.
    entity.liquidity = event.params.liquidity;
    entity.save();

    // Update eternal farming liquidity totals
    let eternalFarming = EternalFarming.load(event.params.incentiveId.toHexString())
    if (eternalFarming) {
      // Add to total liquidity using the now consistently set entity.liquidity
      if (eternalFarming.totalActiveLiquidity.equals(BigInt.zero())) {
        // load virtual pool binding to contract
        let virtualPool = EternalVirtualPool.bind(Address.fromBytes(eternalFarming.virtualPool)) as EternalVirtualPool
        let currentLiquidity = virtualPool.try_currentLiquidity()
        let startFarming = false;
        if (currentLiquidity.reverted) {
          log.error("Virtual pool data reverted in handleTokenStaked", [])
          startFarming = event.params.liquidity.gt(BigInt.zero()) && eternalFarming.totalLiquidity.equals(BigInt.zero());
        } else {
          eternalFarming.totalActiveLiquidity = currentLiquidity.value
          if (eternalFarming.totalActiveLiquidity.gt(BigInt.zero())) {
            startFarming = true;
          }
        }
        if (startFarming) {
          if (!event.block.timestamp.lt(eternalFarming.startTime)) {
            eternalFarming.startTimeVirtual = event.block.timestamp;
            eternalFarming.endTimeImpliedVirtual = event.block.timestamp.plus(eternalFarming.rewardVirtual.div(eternalFarming.rewardRate))
          } else {
            eternalFarming.startTimeVirtual = eternalFarming.startTime;
            eternalFarming.endTimeImpliedVirtual = eternalFarming.startTime.plus(eternalFarming.rewardVirtual.div(eternalFarming.rewardRate))
          }
        }
      }
      eternalFarming.totalLiquidity = eternalFarming.totalLiquidity.plus(entity.liquidity)
      eternalFarming.save()
    }
  }
  // TODO: Consider logging a warning or error if entity == null, as liquidity wouldn't be tracked.
  // For example: else { log.warning("Deposit entity {} not found in handleTokenStaked", [event.params.tokenId.toString()]); }
}

export function handleRewardClaimed(event: RewardClaimed): void {
  let id = event.params.rewardAddress.toHexString() + event.params.owner.toHexString();
  let rewardEntity = Reward.load(id);
  if (rewardEntity != null) {
    rewardEntity.owner = event.params.owner;
    rewardEntity.rewardAddress = event.params.rewardAddress;
    rewardEntity.amount = rewardEntity.amount.minus(event.params.reward);
    rewardEntity.save();
  }
}

export function handleTokenUnstaked(event: FarmEnded): void {

  let entity = Deposit.load(event.params.tokenId.toString());

  if (entity) {
    let eternalFarming = EternalFarming.load(entity.eternalFarming!)

    if (eternalFarming) {
      eternalFarming.reward = eternalFarming.reward.minus(event.params.reward)
      eternalFarming.bonusReward = eternalFarming.bonusReward.minus(event.params.bonusReward)

      // Subtract liquidity from totals
      eternalFarming.totalLiquidity = eternalFarming.totalLiquidity.minus(entity.liquidity)

      let turnOffFarming = eternalFarming.totalLiquidity.equals(BigInt.zero())
      // bind to virtual pool
      let virtualPool = EternalVirtualPool.bind(Address.fromBytes(eternalFarming.virtualPool)) as EternalVirtualPool
      let currentLiquidity = virtualPool.try_currentLiquidity()
      if (currentLiquidity.reverted) {
        log.warning("Virtual pool data reverted in handleTokenUnstaked", [])
      } else {
        eternalFarming.totalActiveLiquidity = currentLiquidity.value
        if (eternalFarming.totalActiveLiquidity.equals(BigInt.zero())) {
          turnOffFarming = true;
        }
        eternalFarming.save()
      }
      if (!event.block.timestamp.lt(eternalFarming.endTimeImpliedVirtual)) {
        eternalFarming.rewardVirtual = BigInt.zero();
        eternalFarming.save();
      } else if (turnOffFarming && !eternalFarming.startTime.gt(event.block.timestamp)) {
        // max value of BigInt
        let elapsedTime = event.block.timestamp.minus(eternalFarming.startTimeVirtual)
        let calcVirtualReward = eternalFarming.rewardVirtual.minus(eternalFarming.rewardRate.times(elapsedTime))
        eternalFarming.rewardVirtual = calcVirtualReward.gt(BigInt.zero()) ? calcVirtualReward : BigInt.zero()
        if (eternalFarming.rewardVirtual.gt(BigInt.zero())) {
          eternalFarming.endTimeImpliedVirtual = infinity
        }
        eternalFarming.save()
      }
    }

    if (entity != null) {
      entity.eternalFarming = null;
      entity.tierEternal = BigInt.fromString("0")
      entity.tokensLockedEternal = BigInt.fromString("0")
      entity.save();
    }

    let id = event.params.rewardAddress.toHexString() + event.params.owner.toHexString()
    let rewardEntity = Reward.load(id)

    if (rewardEntity == null) {
      rewardEntity = new Reward(id)
      rewardEntity.amount = BigInt.fromString('0')
    }

    rewardEntity.owner = event.params.owner
    rewardEntity.rewardAddress = event.params.rewardAddress
    rewardEntity.amount = rewardEntity.amount.plus(event.params.reward)
    rewardEntity.save();


    id = event.params.bonusRewardToken.toHexString() + event.params.owner.toHexString()
    rewardEntity = Reward.load(id)

    if (rewardEntity == null) {
      rewardEntity = new Reward(id)
      rewardEntity.amount = BigInt.fromString('0')
    }

    rewardEntity.owner = event.params.owner
    rewardEntity.rewardAddress = event.params.bonusRewardToken
    rewardEntity.amount = rewardEntity.amount.plus(event.params.bonusReward)
    rewardEntity.save();

  }
}

// helper function for core swap which price changes tick
export function updateEternalFarmingActiveLiquidity(pool: Pool, event: ethereum.Event): void {
  let eternalFarming = EternalFarming.load(pool.id)
  if (eternalFarming) {
    let virtualPool = EternalVirtualPool.bind(Address.fromBytes(eternalFarming.virtualPool)) as EternalVirtualPool
    let currentLiquidity = virtualPool.try_currentLiquidity()
    if (currentLiquidity.reverted) {
      log.warning("Virtual pool data reverted in updateEternalFarmingActiveLiquidity", [])
    } else {
      eternalFarming.totalActiveLiquidity = currentLiquidity.value
    } if (event.block.timestamp.lt(eternalFarming.endTimeImpliedVirtual) &&
      eternalFarming.totalActiveLiquidity.equals(BigInt.zero()) && !eternalFarming.startTime.gt(event.block.timestamp)) {
      let elapsedTime = event.block.timestamp.minus(eternalFarming.startTimeVirtual)
      let calcVirtualReward = eternalFarming.rewardVirtual.minus(eternalFarming.rewardRate.times(elapsedTime))
      eternalFarming.rewardVirtual = calcVirtualReward.gt(BigInt.zero()) ? calcVirtualReward : BigInt.zero()
      if (eternalFarming.rewardVirtual.gt(BigInt.zero())) {
        eternalFarming.endTimeImpliedVirtual = infinity
      }
      eternalFarming.save()
    }
  }
}

export function handleDeactivate(event: IncentiveDeactivated): void {
  /*
    let incentiveIdTuple: Array<ethereum.Value> = [
      ethereum.Value.fromAddress(event.params.rewardToken),
      ethereum.Value.fromAddress(event.params.bonusRewardToken),
      ethereum.Value.fromAddress(event.params.pool),
      ethereum.Value.fromUnsignedBigInt(event.params.startTime),
      ethereum.Value.fromUnsignedBigInt(event.params.endTime)
    ];
  
    let _incentiveTuple = changetype<ethereum.Tuple>(incentiveIdTuple);
  
    let incentiveIdEncoded = ethereum.encode(
      ethereum.Value.fromTuple(_incentiveTuple)
    )!;
    let incentiveId = crypto.keccak256(incentiveIdEncoded);
  
    let entity = EternalFarming.load(incentiveId.toHex());
  
    if (entity) {
      entity.isDetached = true
      entity.save()
      // todo: update virtual reward
    }*/
  // assume never happens
  log.error("IncentiveDeactivated should never happen", [])
}

export function handleRewardAmountsDecreased(event: RewardAmountsDecreased): void {
  /*
  let incentive = EternalFarming.load(event.params.incentiveId.toHexString())
  if (incentive) {
    incentive.bonusReward = incentive.bonusReward.minus(event.params.bonusReward)
    incentive.reward = incentive.reward.minus(event.params.reward)
    if (incentive.totalLiquidity.equals(BigInt.zero())) {
      incentive.endTimeImplied = incentive.startTime.plus(incentive.reward.div(incentive.rewardRate))
    }
    incentive.save()
  }*/
  // assume never happens
  log.error("RewardAmountsDecreased should never happen", [])
}
// assumes only once added at the start
export function handleRewardsRatesChanged(event: RewardsRatesChanged): void {
  let eternalFarming = EternalFarming.load(event.params.incentiveId.toHexString())
  if (eternalFarming) {
    if (eternalFarming.rewardRate != BigInt.fromString("0")) {
      log.error("RewardsRatesChanged should never happen", [])
      return;
    }
    eternalFarming.rewardRate = event.params.rewardRate
    eternalFarming.bonusRewardRate = event.params.bonusRewardRate
    if (eternalFarming.rewardRate != BigInt.fromString("0")) {
      // just simple math
      eternalFarming.endTimeImplied = eternalFarming.startTime.plus(eternalFarming.reward.div(eternalFarming.rewardRate))
      // assumes no one staked after the start
      eternalFarming.endTimeImpliedVirtual = infinity;
    }

    eternalFarming.save()
  }
}
// assumes only once added at the start
export function handleRewardsAdded(event: RewardsAdded): void {
  let eternalFarming = EternalFarming.load(event.params.incentiveId.toHexString())
  if (eternalFarming) {
    if (eternalFarming.rewardRate != BigInt.fromString("0")) {
      log.error("RewardsAdded should never happen", [])
      return;
    }
    eternalFarming.reward = eternalFarming.reward.plus(event.params.rewardAmount)
    eternalFarming.rewardVirtual = eternalFarming.rewardVirtual.plus(event.params.rewardAmount)
    eternalFarming.bonusReward = eternalFarming.bonusReward.plus(event.params.bonusRewardAmount)
    eternalFarming.save()
  }
}

export function handleCollect(event: RewardsCollected): void {

  let entity = Deposit.load(event.params.tokenId.toString());

  if (entity) {
    let eternalFarmingID = entity.eternalFarming!
    let eternalFarming = EternalFarming.load(eternalFarmingID)

    if (eternalFarming) {
      eternalFarming.reward = eternalFarming.reward.minus(event.params.rewardAmount)
      eternalFarming.bonusReward = eternalFarming.bonusReward.minus(event.params.bonusRewardAmount)
      eternalFarming.save()


      let id = eternalFarming.rewardToken.toHexString() + entity.owner.toHexString()
      let rewardEntity = Reward.load(id)

      if (rewardEntity == null) {
        rewardEntity = new Reward(id)
        rewardEntity.amount = BigInt.fromString('0')
      }

      rewardEntity.owner = entity.owner
      rewardEntity.rewardAddress = eternalFarming.rewardToken
      rewardEntity.amount = rewardEntity.amount.plus(event.params.rewardAmount)
      rewardEntity.save();


      id = eternalFarming.bonusRewardToken.toHexString() + entity.owner.toHexString()
      rewardEntity = Reward.load(id)

      if (rewardEntity == null) {
        rewardEntity = new Reward(id)
        rewardEntity.amount = BigInt.fromString('0')
      }

      rewardEntity.owner = entity.owner
      rewardEntity.rewardAddress = eternalFarming.bonusRewardToken
      rewardEntity.amount = rewardEntity.amount.plus(event.params.bonusRewardAmount)
      rewardEntity.save();
    }
  }
}

function getTier(amount: BigInt, incentiveId: string): BigInt {
  let incentive = EternalFarming.load(incentiveId)
  let res = BigInt.fromString("0")
  const MIN_MULTIPLIER = BigInt.fromString("10000")
  if (incentive) {
    if (incentive.tier1Multiplier == MIN_MULTIPLIER && incentive.tier2Multiplier == MIN_MULTIPLIER && incentive.tier3Multiplier == MIN_MULTIPLIER) {
      return res
    }
    if (incentive.tokenAmountForTier3 <= amount)
      res = BigInt.fromString("3")
    else if (incentive.tokenAmountForTier2 <= amount)
      res = BigInt.fromString("2")
    else if (incentive.tokenAmountForTier1 <= amount)
      res = BigInt.fromString("1")
  }
  return res
}