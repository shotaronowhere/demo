import { Bytes, dataSource, json, log, DataSourceContext } from '@graphprotocol/graph-ts';
import { ItemProp, LItemMetadata } from '../../generated/schema';
import { LItemMetametadata as LItemMetametadataTemplate } from '../../generated/templates';
import { JSONValueToBool, JSONValueToMaybeString, extractPath } from '../utils';

export function handleLItemMetadata(content: Bytes): void {
  //log.warning(`handleLItemMetadata`, []);
  const ipfsHash = dataSource.stringParam();

  const parsedResult = json.try_fromBytes(content);

  const context = dataSource.context();
  const graphItemID = context.getString('graphItemID');
  const address = context.getString('address');

  const id = `${ipfsHash}-${graphItemID}`;

  const metadata = new LItemMetadata(id);

  metadata.keywords = address;

  //log.warning(`ipfs hash : {}, content : {}`, [ipfsHash, content.toString()]);

  if (!parsedResult.isOk || parsedResult.isError) {
    log.warning(`Error converting object for graphItemId {}`, [graphItemID]);
    metadata.save();
    return;
  }
  const value = parsedResult.value.toObject();

  const columnsValue = value.get('columns');
  if (!columnsValue) {
    log.warning(`Error getting column values for graphItemID {}`, [
      graphItemID,
    ]);
    metadata.save();
    return;
  }
  const columns = columnsValue.toArray();

  const valuesValue = value.get('values');
  if (!valuesValue) {
    log.warning(`Error getting valuesValue for graphItemID {}`, [graphItemID]);
    metadata.save();
    return;
  }
  const values = valuesValue.toObject();

  let identifier = 0;
  let market: string | null = null;
  let image: string | null = null;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const colObj = col.toObject();

    const label = colObj.get('label');

    // We must account for items with missing fields.
    const checkedLabel = label
      ? label.toString()
      : 'missing-label'.concat(i.toString());

    const description = colObj.get('description');
    const _type = colObj.get('type');
    const isIdentifier = colObj.get('isIdentifier');
    const value = values.get(checkedLabel);
    const itemPropId = graphItemID + '@' + checkedLabel;
    const itemProp = new ItemProp(itemPropId);

    itemProp.value = JSONValueToMaybeString(value);
    itemProp.type = JSONValueToMaybeString(_type);
    itemProp.label = JSONValueToMaybeString(label);
    itemProp.description = JSONValueToMaybeString(description);
    itemProp.isIdentifier = JSONValueToBool(isIdentifier);
    itemProp.item = id;

    if (itemProp.isIdentifier) {
      if (identifier == 0) metadata.key0 = itemProp.value;
      else if (identifier == 1) metadata.key1 = itemProp.value;
      else if (identifier == 2) metadata.key2 = itemProp.value;
      else if (identifier == 3) metadata.key3 = itemProp.value;
      else if (identifier == 4) metadata.key4 = itemProp.value;
      identifier += 1;
    }

    if (itemProp.isIdentifier && itemProp.value != null && metadata.keywords) {
      metadata.keywords =
        (metadata.keywords as string) + ' | ' + (itemProp.value as string);
    }


    // save market for later use
    if (itemProp.label == 'Market' && itemProp.value != null) {
      market = itemProp.value;
    }

    // save token for later use

    // /ipfs/QmbEBipxNk6Lq4RoSvB2aXk9VvbvU6GZj1GPrejWuFyeFp/images.json
    // use ipfs context data source pattern again
    if (itemProp.label == 'Images' && itemProp.value != null) {
      image = itemProp.value;
    }

    itemProp.save();
  }
  metadata.save();
  if (market !== null && image !== null) {
    const metametadataIpfsHash = extractPath(image!);
    metadata.metametadata = metametadataIpfsHash;

    log.debug('Creating metametadata datasource for ipfs hash : {}', [metametadataIpfsHash]);

    const metametadataContext = new DataSourceContext();
    metametadataContext.setString('metadataID', id);
    metametadataContext.setString('address', address);
    metametadataContext.setString('market', market!);
    metametadataContext.setString('LItem', graphItemID);

    LItemMetametadataTemplate.createWithContext(metametadataIpfsHash, metametadataContext);
  }
}
