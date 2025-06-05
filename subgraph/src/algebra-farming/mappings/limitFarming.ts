import { ethereum, crypto, BigInt, Address } from '@graphprotocol/graph-ts';
import {
  LimitFarmingCreated,
  FarmEntered,
  FarmEnded,
  RewardClaimed,
  IncentiveDeactivated,
  RewardsAdded,
  RewardAmountsDecreased
} from '../../../generated/LimitFarming/LimitFarming';
import { LimitFarming, Deposit, Reward, Pool } from '../../../generated/schema';
import { createTokenEntity } from '../utils/token';
import { ADDRESS_ZERO } from '../../algebra/utils/constants';



export function handleIncentiveCreated(event: LimitFarmingCreated): void {
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

  let entity = LimitFarming.load(incentiveId.toHex());
  if (entity == null) {
    entity = new LimitFarming(incentiveId.toHex());
    entity.reward = BigInt.fromString("0");
    entity.bonusReward = BigInt.fromString("0");
  }

  entity.rewardToken = event.params.rewardToken;
  entity.bonusRewardToken = event.params.bonusRewardToken;
  entity.pool = event.params.pool;
  entity.startTime = event.params.startTime;
  entity.endTime = event.params.endTime;
  entity.minRangeLength = BigInt.fromI32(event.params.minimalAllowedPositionWidth)
  entity.reward = entity.reward.plus(event.params.reward);
  entity.bonusReward = entity.bonusReward.plus(event.params.bonusReward);
  entity.createdAtTimestamp = event.block.timestamp;
  entity.tokenAmountForTier1 = event.params.tiers.tokenAmountForTier1
  entity.tokenAmountForTier2 = event.params.tiers.tokenAmountForTier2
  entity.tokenAmountForTier3 = event.params.tiers.tokenAmountForTier3
  entity.tier1Multiplier = event.params.tiers.tier1Multiplier
  entity.tier2Multiplier = event.params.tiers.tier2Multiplier
  entity.tier3Multiplier = event.params.tiers.tier3Multiplier
  entity.multiplierToken = event.params.multiplierToken
  entity.enterStartTime = event.params.enterStartTime

  entity.save();

}


export function handleTokenStaked(event: FarmEntered): void {
  let entity = Deposit.load(event.params.tokenId.toString());
  if (entity != null) {
    entity.limitFarming = event.params.incentiveId.toHexString();
    entity.tokensLockedLimit = event.params.tokensLocked;
    entity.tierLimit = getTier(event.params.tokensLocked, event.params.incentiveId.toHexString())
    entity.save();
  }
}

export function handleRewardClaimed(event: RewardClaimed): void {
  let id = event.params.rewardAddress.toHexString() + event.params.owner.toHexString()
  let rewardEntity = Reward.load(id)
  if (rewardEntity != null) {
    rewardEntity.owner = event.params.owner
    rewardEntity.rewardAddress = event.params.rewardAddress
    rewardEntity.amount = rewardEntity.amount.minus(event.params.reward)
    rewardEntity.save()
  }
}

export function handleTokenUnstaked(event: FarmEnded): void {

  let entity = Deposit.load(event.params.tokenId.toString());

  if (entity != null) {
    entity.limitFarming = null;
    entity.tierLimit = BigInt.fromString("0");
    entity.tokensLockedLimit = BigInt.fromString("0");
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

  let entity = LimitFarming.load(incentiveId.toHex());

  if (entity) {
    entity.isDetached = true
    entity.save()
  }

}

export function handleRewardsAdded(event: RewardsAdded): void {
  let incentive = LimitFarming.load(event.params.incentiveId.toHexString())
  if (incentive) {
    incentive.bonusReward = incentive.bonusReward.plus(event.params.bonusRewardAmount);
    incentive.reward = incentive.reward.plus(event.params.rewardAmount);
    incentive.save()
  }
}

export function handleRewardAmountsDecreased(event: RewardAmountsDecreased): void {
  let incentive = LimitFarming.load(event.params.incentiveId.toHexString())
  if (incentive) {
    incentive.bonusReward = incentive.bonusReward.minus(event.params.bonusReward);
    incentive.reward = incentive.reward.minus(event.params.reward);
    incentive.save()
  }
}


function getTier(amount: BigInt, incentiveId: string): BigInt {
  let incentive = LimitFarming.load(incentiveId)
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