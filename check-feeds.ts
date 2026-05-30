import axios from 'axios';

async function checkFeeds() {
    try {
        const url = "https://oracle-gateway-1.a.redstone.vip/v2/data-packages/latest/redstone-primary-prod";
        const res = await axios.get(url);
        const keys = Object.keys(res.data);
        
        console.log("Total feeds:", keys.length);
        console.log("Feeds matching IP:", keys.filter(k => k.toLowerCase().includes('ip')));
        console.log("Feeds matching STORY:", keys.filter(k => k.toLowerCase().includes('story')));
    } catch (err) {
        console.error(err);
    }
}
checkFeeds();
