import { ethereum, crypto, BigInt } from '@graphprotocol/graph-ts';
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

  createTokenEntity(event.params.rewardToken)
  createTokenEntity(event.params.bonusRewardToken)
  createTokenEntity(event.params.multiplierToken)

  let _incentiveTuple = changetype<ethereum.Tuple>(incentiveIdTuple);

  let incentiveIdEncoded = ethereum.encode(
    ethereum.Value.fromTuple(_incentiveTuple)
  )!;
  let incentiveId = crypto.keccak256(incentiveIdEncoded);

  let entity = EternalFarming.load(incentiveId.toHex());
  if (entity == null) {
    entity = new EternalFarming(incentiveId.toHex());
    entity.reward = BigInt.fromString("0");
    entity.bonusReward = BigInt.fromString("0");
    entity.rewardRate = BigInt.fromString("0");
    entity.bonusRewardRate = BigInt.fromString("0");
    entity.endTimeImplied = BigInt.fromString("0");
    entity.totalLiquidity = BigInt.fromString("0");
    entity.totalActiveLiquidity = BigInt.fromString("0");
  }
  entity.reward = event.params.reward;
  entity.bonusReward = event.params.bonusReward;
  entity.rewardToken = event.params.rewardToken;
  entity.bonusRewardToken = event.params.bonusRewardToken;
  entity.pool = event.params.pool.toHexString();
  entity.virtualPool = event.params.virtualPool;
  entity.startTime = event.params.startTime;
  entity.endTime = event.params.endTime;
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
      eternalFarming.totalLiquidity = eternalFarming.totalLiquidity.plus(entity.liquidity)

      // Check if position is eligible for rewards (meets range requirements AND is in range)
      let position = Position.load(event.params.tokenId.toString()) // For eligibility checks (ticks)
      let pool = Pool.load(eternalFarming.pool) // For eligibility checks

      if (position && pool && isPositionEligibleForRewards(position, pool, eternalFarming.minRangeLength)) {
        // Use the now consistently set entity.liquidity for active liquidity as well
        eternalFarming.totalActiveLiquidity = eternalFarming.totalActiveLiquidity.plus(entity.liquidity)
      }

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

      // Check if position was eligible for rewards before unstaking
      let position = Position.load(event.params.tokenId.toString())
      let pool = Pool.load(eternalFarming.pool)

      if (position && pool && isPositionEligibleForRewards(position, pool, eternalFarming.minRangeLength)) {
        eternalFarming.totalActiveLiquidity = eternalFarming.totalActiveLiquidity.minus(entity.liquidity)
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

export function handleDeactivate(event: IncentiveDeactivated): void {

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
  }

}

export function handleRewardAmountsDecreased(event: RewardAmountsDecreased): void {
  let incentive = EternalFarming.load(event.params.incentiveId.toHexString())
  if (incentive) {
    incentive.bonusReward = incentive.bonusReward.minus(event.params.bonusReward)
    incentive.reward = incentive.reward.minus(event.params.reward)
    if (incentive.rewardRate.gt(BigInt.zero())) {
      incentive.endTimeImplied = incentive.startTime.plus(incentive.reward.div(incentive.rewardRate))
    }
    incentive.save()
  }
}

export function handleRewardsRatesChanged(event: RewardsRatesChanged): void {
  let eternalFarming = EternalFarming.load(event.params.incentiveId.toHexString())
  if (eternalFarming) {
    eternalFarming.rewardRate = event.params.rewardRate
    eternalFarming.bonusRewardRate = event.params.bonusRewardRate
    if (eternalFarming.rewardRate.gt(BigInt.zero())) {
      eternalFarming.endTimeImplied = eternalFarming.startTime.plus(eternalFarming.reward.div(eternalFarming.rewardRate))
    } else {
      // If rewardRate is 0, but there's still reward, it implies the reward emission effectively stops or becomes indefinite.
      // If reward is also 0, endTimeImplied could be startTime or the original endTime.
      // Setting to original endTime if reward > 0 and rate is 0, as rewards won't deplete.
      // Or, set to 0 or a specific marker if that's more appropriate for your system.
      // For now, let's consider setting it to original endTime if rewards exist but rate is zero.
      // If no rewards, startTime might be appropriate. This needs business logic definition.
      // If reward is > 0, it implies rewards will never be depleted if rate is 0.
      // One option is to set endTimeImplied to a very large number or original endTime.
      // If reward is 0, then startTime is logical if the rate is also 0.
      if (eternalFarming.reward.gt(BigInt.zero())) {
        eternalFarming.endTimeImplied = eternalFarming.endTime; // Or a very large number / MAX_UINT
      } else {
        eternalFarming.endTimeImplied = eternalFarming.startTime; // No rewards, no rate, so effectively ends at start
      }
    }
    eternalFarming.save()
  }
}

export function handleRewardsAdded(event: RewardsAdded): void {
  let eternalFarming = EternalFarming.load(event.params.incentiveId.toHexString())
  if (eternalFarming) {
    eternalFarming.reward = eternalFarming.reward.plus(event.params.rewardAmount)
    eternalFarming.bonusReward = eternalFarming.bonusReward.plus(event.params.bonusRewardAmount)
    if (eternalFarming.rewardRate != BigInt.fromString("0")) {
      eternalFarming.endTimeImplied = eternalFarming.startTime.plus(eternalFarming.reward.div(eternalFarming.rewardRate))
    }
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

function isPositionInRange(position: Position, pool: Pool): boolean {
  if (pool.tick === null) {
    return false
  }

  // Extract tick values from position tick IDs (format: "poolAddress#tickValue")
  let tickLowerStr = position.tickLower.split('#')[1]
  let tickUpperStr = position.tickUpper.split('#')[1]

  let tickLower = BigInt.fromString(tickLowerStr)
  let tickUpper = BigInt.fromString(tickUpperStr)
  let currentTick = pool.tick!

  // Position is in range if: tickLower <= currentTick < tickUpper
  return tickLower <= currentTick && currentTick < tickUpper
}

function isPositionEligibleForRewards(position: Position, pool: Pool, minRangeLength: BigInt): boolean {
  // Check both range requirements and if position is currently in range
  let tickLowerStr = position.tickLower.split('#')[1]
  let tickUpperStr = position.tickUpper.split('#')[1]

  let tickLower = BigInt.fromString(tickLowerStr)
  let tickUpper = BigInt.fromString(tickUpperStr)
  let rangeLength = tickUpper.minus(tickLower)

  // Must meet minimum range requirement AND be in range
  return rangeLength >= minRangeLength && isPositionInRange(position, pool)
}

// Function called from the core swap handler to update eternal farming liquidity
// when the pool tick changes due to swaps
export function updateEternalFarmingActiveLiquidity(poolAddress: string, oldTick: BigInt | null, newTick: BigInt): void {
  let pool = Pool.load(poolAddress)
  if (!pool) return

  // Since each pool can only have ONE eternal farm, we can access it directly via derived field!
  let eternalFarms = pool.eternalFarm.load()
  if (eternalFarms.length == 0) return // No eternal farm for this pool

  let eternalFarm = eternalFarms[0] // Only one eternal farm per pool
  // Recalculate the total active liquidity for this farm
  recalculateEternalFarmActiveLiquidity(eternalFarm.id)
}

// Recalculate active liquidity for a specific eternal farm after tick change
export function recalculateEternalFarmActiveLiquidity(farmId: string): void {
  let eternalFarming = EternalFarming.load(farmId)
  if (!eternalFarming) return

  let pool = Pool.load(eternalFarming.pool)
  if (!pool) return

  let totalActiveLiquidity = BigInt.fromString("0")

  // Use the derived field to get all deposits in this farm
  let deposits = eternalFarming.deposits.load()

  for (let i = 0; i < deposits.length; i++) {
    let deposit = deposits[i]
    let position = Position.load(deposit.id)

    if (position && isPositionEligibleForRewards(position, pool, eternalFarming.minRangeLength)) {
      totalActiveLiquidity = totalActiveLiquidity.plus(deposit.liquidity)
    }
  }

  eternalFarming.totalActiveLiquidity = totalActiveLiquidity
  eternalFarming.save()
}

// Helper function that could be used to update a specific position's farm when we know about it
export function updatePositionFarmEligibility(tokenId: string, oldTick: BigInt | null, newTick: BigInt): void {
  let deposit = Deposit.load(tokenId)
  if (!deposit || !deposit.eternalFarming) return

  let position = Position.load(tokenId)
  let eternalFarming = EternalFarming.load(deposit.eternalFarming!)
  let pool = Pool.load(deposit.pool)

  if (!position || !eternalFarming || !pool) return

  // Check if eligibility changed due to tick movement
  let wasEligible = false
  let isEligible = false

  if (oldTick !== null) {
    // Temporarily set old tick to check previous eligibility
    let savedTick = pool.tick
    pool.tick = oldTick
    wasEligible = isPositionEligibleForRewards(position, pool, eternalFarming.minRangeLength)
    pool.tick = savedTick
  }

  // Check current eligibility
  isEligible = isPositionEligibleForRewards(position, pool, eternalFarming.minRangeLength)

  // Update farm's active liquidity if eligibility changed
  if (wasEligible != isEligible) {
    if (isEligible) {
      // Position became eligible
      eternalFarming.totalActiveLiquidity = eternalFarming.totalActiveLiquidity.plus(deposit.liquidity)
    } else {
      // Position became ineligible  
      eternalFarming.totalActiveLiquidity = eternalFarming.totalActiveLiquidity.minus(deposit.liquidity)
    }
    eternalFarming.save()
  }
}    
