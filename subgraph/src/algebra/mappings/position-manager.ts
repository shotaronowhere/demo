/* eslint-disable prefer-const */
import {
  Collect,
  IncreaseLiquidity,
  DecreaseLiquidity,
  NonfungiblePositionManager,
  Transfer
} from '../../../generated/NonfungiblePositionManager/NonfungiblePositionManager'
import { Position, Deposit, PositionSnapshot, Token } from '../../../generated/schema'
import { ADDRESS_ZERO, factoryContract, ZERO_BD, ZERO_BI, pools_list } from '../utils/constants'
import { Address, BigInt, ethereum } from '@graphprotocol/graph-ts'
import { convertTokenToDecimal, loadTransaction } from '../utils'
import { FarmingCenterAddress } from '../../algebra-farming/utils/constants'


function getPosition(event: ethereum.Event, tokenId: BigInt): Position | null {


  let position = Position.load(tokenId.toString())
  if (position === null) {
    let contract = NonfungiblePositionManager.bind(event.address)
    let positionCall = contract.try_positions(tokenId)

    // the following call reverts in situations where the position is minted
    // and deleted in the same block 
    const stringBoolean = `${positionCall.reverted}`;
    if (!positionCall.reverted) {
      let positionResult = positionCall.value
      let poolAddress = factoryContract.poolByPair(positionResult.value2, positionResult.value3)

      position = new Position(tokenId.toString())
      // The owner gets correctly updated in the Transfer handler
      position.owner = Address.fromString(ADDRESS_ZERO)
      position.pool = poolAddress.toHexString()
      if (pools_list.includes(position.pool)) {
        position.token0 = positionResult.value3.toHexString()
        position.token1 = positionResult.value2.toHexString()
      }
      else {
        position.token0 = positionResult.value2.toHexString()
        position.token1 = positionResult.value3.toHexString()
      }
      position.tickLower = position.pool.concat('#').concat(positionResult.value4.toString())
      position.tickUpper = position.pool.concat('#').concat(positionResult.value5.toString())
      position.liquidity = ZERO_BI
      position.depositedToken0 = ZERO_BD
      position.depositedToken1 = ZERO_BD
      position.withdrawnToken0 = ZERO_BD
      position.withdrawnToken1 = ZERO_BD
      position.collectedToken0 = ZERO_BD
      position.collectedToken1 = ZERO_BD
      position.collectedFeesToken0 = ZERO_BD
      position.collectedFeesToken1 = ZERO_BD
      position.transaction = loadTransaction(event).id
      position.feeGrowthInside0LastX128 = positionResult.value7
      position.feeGrowthInside1LastX128 = positionResult.value8
    }
  }

  return position

  return null
}


function updateFeeVars(position: Position, event: ethereum.Event, tokenId: BigInt): Position {

  let positionManagerContract = NonfungiblePositionManager.bind(event.address)
  let positionResult = positionManagerContract.try_positions(tokenId)
  if (!positionResult.reverted) {
    position.feeGrowthInside0LastX128 = positionResult.value.value7
    position.feeGrowthInside1LastX128 = positionResult.value.value8
  }
  return position
}

function savePositionSnapshot(position: Position, event: ethereum.Event): void {

  let positionSnapshot = new PositionSnapshot(position.id.concat('#').concat(event.block.number.toString()))
  positionSnapshot.owner = position.owner
  positionSnapshot.pool = position.pool
  positionSnapshot.position = position.id
  positionSnapshot.blockNumber = event.block.number
  positionSnapshot.timestamp = event.block.timestamp
  positionSnapshot.liquidity = position.liquidity

  if (pools_list.includes(position.pool)) {
    positionSnapshot.depositedToken0 = position.depositedToken1
    positionSnapshot.depositedToken1 = position.depositedToken0
    positionSnapshot.withdrawnToken0 = position.withdrawnToken1
    positionSnapshot.withdrawnToken1 = position.withdrawnToken0
    positionSnapshot.collectedFeesToken0 = position.collectedFeesToken1
    positionSnapshot.collectedFeesToken1 = position.collectedFeesToken0
    positionSnapshot.transaction = loadTransaction(event).id
    positionSnapshot.feeGrowthInside0LastX128 = position.feeGrowthInside1LastX128
    positionSnapshot.feeGrowthInside1LastX128 = position.feeGrowthInside0LastX128
  }
  else {
    positionSnapshot.depositedToken0 = position.depositedToken0
    positionSnapshot.depositedToken1 = position.depositedToken1
    positionSnapshot.withdrawnToken0 = position.withdrawnToken0
    positionSnapshot.withdrawnToken1 = position.withdrawnToken1
    positionSnapshot.collectedFeesToken0 = position.collectedFeesToken0
    positionSnapshot.collectedFeesToken1 = position.collectedFeesToken1
    positionSnapshot.transaction = loadTransaction(event).id
    positionSnapshot.feeGrowthInside0LastX128 = position.feeGrowthInside0LastX128
    positionSnapshot.feeGrowthInside1LastX128 = position.feeGrowthInside1LastX128
  }

  positionSnapshot.save()
}

export function handleIncreaseLiquidity(event: IncreaseLiquidity): void {

  let position = getPosition(event, event.params.tokenId)

  // position was not able to be fetched
  if (position == null) {
    return
  }
  let token0 = Token.load(position.token0)
  let token1 = Token.load(position.token1)

  if (token0 == null || token1 == null) {
    return
  }


  let amount1 = ZERO_BD
  let amount0 = ZERO_BD

  if (pools_list.includes(position.pool))
    amount0 = convertTokenToDecimal(event.params.amount1, token0!.decimals)
  else
    amount0 = convertTokenToDecimal(event.params.amount0, token0!.decimals)

  if (pools_list.includes(position.pool))
    amount1 = convertTokenToDecimal(event.params.amount0, token1!.decimals)
  else
    amount1 = convertTokenToDecimal(event.params.amount1, token1!.decimals)

  position.liquidity = position.liquidity.plus(event.params.liquidity)
  position.depositedToken0 = position.depositedToken0.plus(amount0)
  position.depositedToken1 = position.depositedToken1.plus(amount1)


  // recalculatePosition(position)


  position.save()

  savePositionSnapshot(position, event)

  // farming


  let entity = Deposit.load(event.params.tokenId.toString());

  if (entity == null) {
    entity = new Deposit(event.params.tokenId.toString());
    entity.owner = event.transaction.from;
    entity.pool = event.params.pool.toHexString();
    entity.onFarmingCenter = false;
    entity.liquidity = BigInt.fromString("0")
    entity.rangeLength = getRangeLength(event.params.tokenId, event.address)
    entity.L2tokenId = event.params.tokenId
    entity.tokensLockedLimit = BigInt.fromString("0")
    entity.tokensLockedEternal = BigInt.fromString("0")
    entity.tierLimit = BigInt.fromString("0")
    entity.tierEternal = BigInt.fromString("0")
  }
  entity.liquidity = entity.liquidity.plus(event.params.liquidity);
  entity.save();

}

export function handleDecreaseLiquidity(event: DecreaseLiquidity): void {
  let position = getPosition(event, event.params.tokenId)

  // position was not able to be fetched
  if (position == null) {
    return
  }

  let token0 = Token.load(position.token0)
  let token1 = Token.load(position.token1)

  if (token0 == null || token1 == null) {
    return
  }

  let amount1 = ZERO_BD
  let amount0 = ZERO_BD

  if (pools_list.includes(position.pool))
    amount0 = convertTokenToDecimal(event.params.amount1, token0!.decimals)
  else
    amount0 = convertTokenToDecimal(event.params.amount0, token0!.decimals)


  if (pools_list.includes(position.pool))
    amount1 = convertTokenToDecimal(event.params.amount0, token1!.decimals)
  else
    amount1 = convertTokenToDecimal(event.params.amount1, token1!.decimals)


  position.liquidity = position.liquidity.minus(event.params.liquidity)
  position.withdrawnToken0 = position.withdrawnToken0.plus(amount0)
  position.withdrawnToken1 = position.withdrawnToken1.plus(amount1)

  position = updateFeeVars(position, event, event.params.tokenId)
  // recalculatePosition(position)

  position.save()

  savePositionSnapshot(position, event)

  //farming

  let deposit = Deposit.load(event.params.tokenId.toString());
  if (deposit) {
    deposit.liquidity = deposit.liquidity.minus(event.params.liquidity)
    deposit.save()
  }
}


export function handleCollect(event: Collect): void {
  let position = getPosition(event, event.params.tokenId)

  // position was not able to be fetched
  if (position == null) {
    return
  }

  let token0 = Token.load(position.token0)
  let token1 = Token.load(position.token1)

  if (token0 == null || token1 == null) {
    return
  }

  let amount1 = ZERO_BD
  let amount0 = ZERO_BD


  if (pools_list.includes(position.pool))
    amount0 = convertTokenToDecimal(event.params.amount1, token0!.decimals)
  else
    amount0 = convertTokenToDecimal(event.params.amount0, token0!.decimals)


  if (pools_list.includes(position.pool))
    amount1 = convertTokenToDecimal(event.params.amount0, token1!.decimals)
  else
    amount1 = convertTokenToDecimal(event.params.amount1, token1!.decimals)


  position.collectedToken0 = position.collectedToken0.plus(amount0)
  position.collectedToken1 = position.collectedToken1.plus(amount1)

  position.collectedFeesToken0 = position.collectedToken0.minus(position.withdrawnToken0)
  position.collectedFeesToken1 = position.collectedToken1.minus(position.withdrawnToken1)

  position = updateFeeVars(position, event, event.params.tokenId)

  // recalculatePosition(position)

  position.save()

  savePositionSnapshot(position, event)
}

export function handleTransfer(event: Transfer): void {

  let position = getPosition(event, event.params.tokenId)

  // position was not able to be fetched
  if (position == null) {
    return
  }

  let token0 = Token.load(position.token0)
  let token1 = Token.load(position.token1)

  // atleast 1 token must be a seer token
  if (token0 === null) {
    if (token1 === null) {
      return;
    } else {
      if (!token1.isSeer) {
        return;
      }
    }
  }


  position.owner = event.params.to
  position.save()

  savePositionSnapshot(position, event)

  // farming


  let entity = Deposit.load(event.params.tokenId.toString());

  if (entity != null) {
    entity.owner = event.params.to;

    if (event.params.to == FarmingCenterAddress) {
      entity.onFarmingCenter = true
      entity.owner = event.params.from;
    }

    if (event.params.from == FarmingCenterAddress) {
      entity.onFarmingCenter = false
    }
    entity.save();
  }

}

function getRangeLength(tokenId: BigInt, eventAddress: Address): BigInt {
  let contract = NonfungiblePositionManager.bind(eventAddress)
  let positionCall = contract.try_positions(tokenId)

  // the following call reverts in situations where the position is minted
  // and deleted in the same block 
  const stringBoolean = `${positionCall.reverted}`
  if (!positionCall.reverted) {
    let positionResult = positionCall.value
    return BigInt.fromI32(positionResult.value5 - positionResult.value4)
  }
  else {
    return BigInt.fromString('0')
  }
}