const crypto = require('crypto');
const isEmpty = require('lodash/isEmpty');
const { createChannel, createMessage, mamAttach, mamFetchAll, TrytesHelper } = require('@iota/mam.js');
const { getSettings, logMessage } = require('./firebase');

const generateSeed = (length = 81) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ9';
  let seed = '';
  while (seed.length < length) {
      const byte = crypto.randomBytes(1);
      if (byte[0] < 243) {
          seed += charset.charAt(byte[0] % 27);
      }
  }
  return seed;
};

const getExplorerURL = (root, sideKey, network) => {
  //TODO: network needs to be replaced with "testnet" instead of "devnet" in firebase settings table
  return `https://explorer.iota.org/${network}/streams/0/${root}/restricted/${sideKey}`
};

const publish = async (payload, tag, currentState = {}, streamId = null) => {
  const logs = [];

  const settings = await getSettings();
  if (!settings || isEmpty(settings.tangle)) {
    const settingsErrorMessage = 'Settings not defined';
    settings.enableCloudLogs && logs.push(settingsErrorMessage);
    console.error(settingsErrorMessage);
    throw new Error(settingsErrorMessage);
  }

  try {
    // Setup the details for the channel.
    const { node, security, defaultTag, network } = settings.tangle;
    let channelState = !isEmpty(currentState) ? currentState : null;
    const sideKey = !isEmpty(currentState) ? currentState.sideKey : generateSeed();

    // If we haven't received existing channel details then create a new channel.
    if (!channelState || isEmpty(channelState)) {
      channelState = createChannel(generateSeed(), security, 'restricted', sideKey);
    }

    // Create a Streams message using the channel state.
    const message = createMessage(channelState, TrytesHelper.fromAscii(JSON.stringify(payload)));
    const root = !isEmpty(currentState) ? currentState.root : message.root;

    if (settings.enableCloudLogs) {
      const attachMessage = `Attaching to Tangle, please wait... ${root}`;
      logs.push(attachMessage);
      console.log(attachMessage);
    }

    // Attach the message.    
    await mamAttach(node, message, tag || defaultTag);
    
    channelState.root = root;
    channelState.address = message.address;

    const explorer = getExplorerURL(root, sideKey, network);

    if (settings.enableCloudLogs) {
      // Log success
      const message = `You can view the Stream channel here ${explorer}`;
      logs.push(message);
      console.log(message);

      if (bundleHash) {
        const bundleMessage = `Bundle hash: ${bundleHash}`;
        logs.push(bundleMessage);
        console.log(bundleMessage);
      }

      await logMessage(logs, 'logs', streamId);
    }

    return { metadata: channelState, explorer };

  } catch (attachError) {
    const attachErrorMessage = 'Streams attach message failed';
    console.error(attachErrorMessage, attachError);
    throw new Error(attachErrorMessage, attachError);
  }
}

const fetch = async (channelState, streamId = null) => {
  const logs = [];

  const settings = await getSettings();
  if (!settings || isEmpty(settings.tangle)) {
    const settingsErrorMessage = 'Settings not defined';
    settings.enableCloudLogs && logs.push(settingsErrorMessage);

    console.error(settingsErrorMessage);
    throw new Error(settingsErrorMessage);
  }

  try {
    // Setup the details for the channel.
    const { chunkSize, node } = settings.tangle;
    const { root, sideKey } = channelState;

    settings.enableCloudLogs && logs.push('Fetching from Tangle, please wait...', root);

    const fetched = await mamFetchAll(node, root, 'restricted', sideKey, chunkSize);
    const result = [];
        
    if (fetched && fetched.length > 0) {
        for (let i = 0; i < fetched.length; i++) {
          fetched[i] && fetched[i].message && 
          result.push(JSON.parse(TrytesHelper.toAscii(fetched[i].message)));
        }
    }
    
    if (settings.enableCloudLogs) {
      if (result.length) {
        // Log success
        const message = `Fetched from ${root}: ${result.length}`;
        console.log(message);
        logs.push(message);
      } else {
        const message = `Nothing was fetched from the Streams channel ${root}`;
        console.error(message);
        logs.push(message);
      }

      await logMessage(logs, 'logs', streamId);
    }

    return result;

  } catch (fetchError) {
    const fetchErrorMessage = 'Streams fetch message failed';
    console.error(fetchErrorMessage, fetchError);
    throw new Error(fetchErrorMessage, fetchError);
  }
}

module.exports = {
  fetch,
  publish,
  getExplorerURL
}