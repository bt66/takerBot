import axios from 'axios';
import { ethers } from 'ethers';
import fs from 'fs';
import log from './utils/logger.js';
import iniBapakBudi from './utils/banner.js';
import ngopiBro from './utils/contract.js';
import { SocksProxyAgent } from 'socks-proxy-agent';
import 'dotenv/config'

function readWallets() {
    if (fs.existsSync("wallets.json")) {
        const data = fs.readFileSync("wallets.json");
        return JSON.parse(data);
    } else {
        log.error("No wallets found in wallets.json. Exiting...");
        process.exit(1);
    }
}

const API = 'https://lightmining-api.taker.xyz/';
const axiosInstance = axios.create({
    baseURL: API,
});

const get = async (url, token, proxy) => {
    return await axiosInstance.get(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        httpsAgent: proxy? proxy: undefined
    });
};

const post = async (url, data, proxy, config = {}) => {
    return await axiosInstance.post(url, data, {
        ...config,
        httpsAgent: proxy? proxy: undefined
    });
};

const sleep = (s) => {
    return new Promise((resolve) => setTimeout(resolve, s * 1000));
};

async function signMessage(message, privateKey) {
    const wallet = new ethers.Wallet(privateKey);
    try {
        const signature = await wallet.signMessage(message);
        return signature;
    } catch (error) {
        log.error("Error signing message:", error);
        return null;
    }
}

const getUser = async (token, proxy, retries = 3) => {
    try {
        const response = await get('user/getUserInfo', token, proxy);
        return response.data;
    }
    catch (error) {
        if (retries > 0) {
            log.error("Failed to get user data:", error.message);
            log.warn(`Retrying... (${retries - 1} attempts left)`);
            await sleep(3);
            return await getUser(token, retries - 1);
        } else {
            log.error("Failed to get user data after retries:", error.message);
            return null;
        }
    }
};
const getNonce = async (walletAddress, retries = 3, proxy) => {
    try {
        const res = await post(`wallet/generateNonce`, { walletAddress }, proxy);
        return res.data;
    } catch (error) {
        if (retries > 0) {
            log.error("Failed to get nonce:", error.message);
            log.warn(`Retrying... (${retries - 1} attempts left)`);
            await sleep(3);
            return await getNonce(walletAddress, retries - 1, proxy);
        } else {
            log.error("Failed to get nonce after retries:", error.message);
            return null;
        }

    }
};

const login = async (address, message, signature, retries = 3, proxy) => {
    try {
        const res = await post(`wallet/login`, 
            {
                address,
                message,
                signature,
            },
            proxy
        );
        return res.data.data;
    } catch (error) {
        if (retries > 0) {
            log.error("Failed to login:", error.message);
            log.warn(`Retrying... (${retries - 1} attempts left)`);
            await sleep(3);
            return await login(address, message, signature, retries - 1, proxy);
        } else {
            log.error("Failed to login after retries:", error.message);
            return null;
        }
    }
};

const getMinerStatus = async (token, retries = 3, proxy) => {
    try {
        const response = await get('assignment/totalMiningTime', token, proxy);
        return response.data;
    }
    catch (error) {
        if (retries > 0) {
            log.error("Failed to get user mine data:", error.message);
            log.warn(`Retrying... (${retries - 1} attempts left)`);
            await sleep(3);
            return await getUser(token, retries - 1, proxy);
        } else {
            log.error("Failed to get user mine data after retries:", error.message);
            return null;
        }
    }
};

const startMine = async (token, retries = 3, proxy) => {
    try {
        const res = await post(
            `assignment/startMining`,
            {},
            proxy,
            { headers: { Authorization: `Bearer ${token}` }}
        );
        console.log(res.data)
        return res.data;
    } catch (error) {
        if (retries > 0) {
            log.error("Failed to start mining:", error.message);
            log.warn(`Retrying... (${retries - 1} attempts left)`);
            await sleep(3);
            return await startMine(token, retries - 1, proxy);
        } else {
            log.error("Failed to start mining after retries:", error.message);
            return null;
        }
    }
};

const notifyToDiscord = async (webhookUrl,message) => {
    try {
        const res = await post(webhookUrl,message)
        console.log("Embed message sent successfully:", res.data);
        return res.data
    } catch (error) {
        log.error("Error sending webhook", error.response?.data || error.message)
        return null
    }
}

const main = async () => {
    // log.info(iniBapakBudi)
    // console.log(process.env.DISCORD_WEBHOOK_URL)
    const wallets = readWallets();
    if (wallets.length === 0) {
        log.error('', "No wallets found in wallets.json file - exiting program.");
        process.exit(1);
    }
    console.log(process.env.DISCORD_NOTIFICATION == true)
    
    while (true) {
        log.warn('', ` === Sever is down bot might be slow - Just be patient ===`);
        log.info(`Starting processing all wallets:`, wallets.length);

        for (const wallet of wallets) {
            console.log(wallet.proxyUrl)
            const agent = wallet.proxyUrl? new SocksProxyAgent(wallet.proxyUrl): undefined;
            const response = await axios.get(
                'https://whatismyip.akamai.com', {
                    httpsAgent: agent
                }
            )
            console.log(response.data);

            const nonceData = await getNonce(wallet.address,3, agent);
            if (!nonceData || !nonceData.data || !nonceData.data.nonce) {
                log.error(`Failed to retrieve nonce for wallet: ${wallet.address}`);
                continue;
            }

            const nonce = nonceData.data.nonce;
            const signature = await signMessage(nonce, wallet.privateKey);
            if (!signature) {
                log.error(`Failed to sign message for wallet: ${wallet.address}`);
                continue;
            }
            log.info(`Trying To Login for wallet: ${wallet.address}`);
            const loginResponse = await login(wallet.address, nonce, signature,3, agent);
            if (!loginResponse || !loginResponse.token) {
                log.error(`Login failed for wallet: ${wallet.address}`);
                continue;
            } else {
                log.info(`Login successful...`);
            }

            log.info(`Trying to check user info...`);
            const userData = await getUser(loginResponse.token,agent);
            if (userData && userData.data) {
                const { userId, twName, totalReward } = userData.data;
                log.info(`User Info:`, { userId, twName, totalReward });
                if (!twName) {
                    log.error('', `This wallet (${wallet.address}) is not bound Twitter/X skipping...`);
                    continue;
                }
            } else {
                log.error(`Failed to get user data for wallet: ${wallet.address}`);
            }

            log.info('Trying to check user miner status...')
            const minerStatus = await getMinerStatus(loginResponse.token, 3, agent);
            if (minerStatus && minerStatus.data) {
                const lastMiningTime = minerStatus.data?.lastMiningTime || 0;
                const nextMiningTime = lastMiningTime + 24 * 60 * 60;
                const nextDate = new Date(nextMiningTime * 1000);
                const dateNow = new Date();

                log.info(`Last mining time:`, new Date(lastMiningTime * 1000).toLocaleString());
                
                if (dateNow > nextDate) {
                    log.info(`Trying to start Mining for wallet: ${wallet.address}`);
                    const mineOnchainResponse = await ngopiBro(wallet.privateKey)
                    if (mineOnchainResponse) {
                        console.log(`mine on chain success with tx hash : ${mineOnchainResponse}`)
                        // start mine offchain
                        const mineResponse = await startMine(loginResponse.token, 3, agent);
                        console.log(mineResponse)
                        if(mineResponse) {
                            log.info("activate mine offchain success")
                            // send success notification to discord
                            log.info(`Recheck user info after activate...`);
                            // recheck user info after activate
                            const userDataAfterActivate = await getUser(loginResponse.token,agent);
                            console.log(userDataAfterActivate)
                            if (userDataAfterActivate && userDataAfterActivate.data) {
                                const { userIdAfterActivate, twNameAfterActivate, totalRewardAfterActivate } = userDataAfterActivate.data;
                                log.info(`User Info:`, { userIdAfterActivate, twNameAfterActivate, totalRewardAfterActivate });
                                
                                // send notification to discord
                                if(process.env.DISCORD_NOTIFICATION) {
                                    const testNotify = await notifyToDiscord(process.env.DISCORD_WEBHOOK_URL,
                                        {
                                            embeds: [
                                                {
                                                    title: "Activate taker daily mining success!",
                                                    description: `address: ${wallet.address}`,
                                                    color: 0x3498db, // Blue (Hex:rgb(24, 214, 24))
                                                    fields: [
                                                        {
                                                            name: "point before activate",
                                                            value: `${userData.data.totalReward ? userData.data.totalReward : "undefined"}`,
                                                            inline: true
                                                        },
                                                        {
                                                            name: "point after activate",
                                                            value: `${userDataAfterActivate.data.totalReward ? userDataAfterActivate.data.totalRewar : "undefined"}`,
                                                            inline: true
                                                        }
                                                    ],
                                                    footer: {
                                                        text: `onchain success with tx hash ${mineOnchainResponse}`
                                                    }
                                                }
                                            ]
                                        }
                                    )
                                }
                            } else {
                                log.error(`Failed to get user data for wallet: ${wallet.address}`);
                            }
                        }else {
                            log.error("activate mine offchain failed")
                        }
                    }else {
                        log.error("error mining onchain")
                    }
                } else {
                    log.warn(`Mining already started, next mining time is:`, nextDate.toLocaleString());
                }
            }
        }

        log.info("All wallets processed cooling down for 1 hours before checking again...");
        await sleep(60 * 60); // 1 hour delay
    }
};

main();
