import {
  IncreaseLiquidity,
  DecreaseLiquidity,
  NonfungiblePositionManager,
  Transfer
} from '../../../generated/NonfungiblePositionManager/NonfungiblePositionManager'
import { Deposit } from '../../../generated/schema'
import { BigInt, Address } from '@graphprotocol/graph-ts'
import { FarmingCenterAddress } from '../../algebra-farming/utils/constants'


export function handleIncreaseLiquidity(event: IncreaseLiquidity): void {
  let entity = Deposit.load(event.params.tokenId.toString());

  if (entity == null) {
    entity = new Deposit(event.params.tokenId.toString());
    entity.owner = event.transaction.from;
    entity.pool = event.params.pool;
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

  let deposit = Deposit.load(event.params.tokenId.toString());
  if (deposit) {
    deposit.liquidity = deposit.liquidity.minus(event.params.liquidity)
    deposit.save()
  }
}


export function handleTransfer(event: Transfer): void {

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