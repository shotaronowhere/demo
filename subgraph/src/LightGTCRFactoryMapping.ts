/* eslint-disable prefer-const */
import { BigInt, log } from '@graphprotocol/graph-ts';
import { NewGTCR } from '../generated/LightGTCRFactory/LightGTCRFactory';
import { MetaEvidence, LRegistry } from '../generated/schema';
import { LightGeneralizedTCR as LightGeneralizedTCRDataSource } from '../generated/templates';

export function handleNewGTCR(event: NewGTCR): void {
  if (event.params._address.toHexString().localeCompare('0x5aaf9e23a11440f8c1ad6d2e2e5109c7e52cc672') !== 0) {
    log.info('Skipping event for address {}', [event.params._address.toHexString()]);
    return;
  }

  LightGeneralizedTCRDataSource.create(event.params._address);

  let registry = new LRegistry(event.params._address.toHexString());

  let registrationMetaEvidence = new MetaEvidence(registry.id + '-1');
  registrationMetaEvidence.URI = '';
  registrationMetaEvidence.save();

  let clearingMetaEvidence = new MetaEvidence(registry.id + '-2');
  clearingMetaEvidence.URI = '';
  clearingMetaEvidence.save();

  registry.metaEvidenceCount = BigInt.fromI32(0);
  registry.registrationMetaEvidence = registrationMetaEvidence.id;
  registry.clearingMetaEvidence = clearingMetaEvidence.id;
  registry.numberOfAbsent = BigInt.fromI32(0);
  registry.numberOfRegistered = BigInt.fromI32(0);
  registry.numberOfRegistrationRequested = BigInt.fromI32(0);
  registry.numberOfClearingRequested = BigInt.fromI32(0);
  registry.numberOfChallengedRegistrations = BigInt.fromI32(0);
  registry.numberOfChallengedClearing = BigInt.fromI32(0);
  registry.save();
}
