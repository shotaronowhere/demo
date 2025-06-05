/* eslint-disable prefer-const */
import { BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts'
import { Factory as FactoryContract } from '../../../generated/templates/Pool/Factory'


export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
export const FACTORY_ADDRESS = '0xA0864cCA6E114013AB0e27cbd5B6f4c8947da766'
export const SDAI_ADDRESS = '0xaf204776c7245bf4147c2612bf6e5972ee483701'
export const WXDAI_ADDRESS = '0xe91d153e0b41518a2ce8dd3d7944fa863463a97d'

export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)
export let TICK_SPACING = BigInt.fromI32(60)

export let factoryContract = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS))

export let pools_list = [""]