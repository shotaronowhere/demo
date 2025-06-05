import { Bytes, dataSource, json, log } from '@graphprotocol/graph-ts';
import { MetaItemProp, LItemMetametadata, Image } from '../../generated/schema';
import { JSONValueToBool, JSONValueToMaybeString } from '../utils';

export function handleLItemMetametadata(content: Bytes): void {
    //log.warning(`handleLItemMetametadata`, []);
    const ipfsHash = dataSource.stringParam();

    const parsedResult = json.try_fromBytes(content);

    const context = dataSource.context();
    const metadataID = context.getString('metadataID');
    const address = context.getString('address');
    const market = context.getString('market');
    const LItem = context.getString('LItem');

    const id = ipfsHash + "-" + LItem; // Use just the IPFS hash as ID for metametadata concat with LItem

    let metametadata = LItemMetametadata.load(id);
    if (!metametadata) {
        metametadata = new LItemMetametadata(id);
    } else {
        return;
    }
    // todo handle challenge
    metametadata.keywords = address;

    //log.warning(`metametadata ipfs hash : {}, content : {}`, [ipfsHash, content.toString()]);

    if (!parsedResult.isOk || parsedResult.isError) {
        log.warning(`Error converting metametadata object for metadataID {}`, [metadataID]);
        metametadata.save();
        return;
    }
    const value = parsedResult.value.toObject();

    const marketValue = value.get('market');
    if (!marketValue) {
        log.warning(`Error getting column values for metadataID {}`, [
            metadataID,
        ]);
        metametadata.save();
        return;
    }

    const outcomesValue = value.get('outcomes');
    if (!outcomesValue) {
        log.warning(`Error getting outcomesValue for metadataID {}`, [metadataID]);
        metametadata.save();
        return;
    }
    const outcomes = outcomesValue.toArray();

    const metaItemProp = new MetaItemProp(id);
    metaItemProp.market = marketValue.toString();
    const outcomesArray: string[] = [];
    // iterate over outcomes and add to outcomesArray
    for (let i = 0; i < outcomes.length; i++) {
        const outcome = outcomes[i];
        outcomesArray.push(outcome.toString());
    }
    metaItemProp.outcomes = outcomesArray;
    metaItemProp.metaitem = id;
    metaItemProp.save();
    metametadata.save();

    let image = Image.load(market + "-" + ipfsHash);
    if (!image) {
        image = new Image(market + "-" + ipfsHash);
    }
    image.market = market;
    image.cidMarket = marketValue.toString();
    image.cidOutcomes = outcomesArray;
    image.LItem = LItem;
    image.save();
    // outcomes
    /*
        let marketEntity = Market.load(market);
        if (!marketEntity) {
            log.warning(`Error getting marketEntity for market {}`, [market]);
            return;
        } else {
            marketEntity.image = marketValue.toString();
            marketEntity.save();
    
            for (let i = 0; i < outcomes.length; i++) {
                const token = Token.load(outcomes[i].toString());
                if (token) {
                    token.image = outcomes[i].toString();
                    token.save();
                } else {
                    log.warning(`Error getting token for outcome {}`, [outcomes[i].toString()]);
                }
            }
        }*/
} 