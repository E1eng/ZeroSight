import axios from 'axios';

const SERVICES = [
    "redstone-primary-prod",
    "redstone-main-demo",
    "redstone-rapid-demo",
    "story-odyssey",
    "story-aeneid",
    "story-testnet",
    "story",
    "aeneid",
    "redstone-story",
    "redstone-aeneid"
];

async function checkFeeds() {
    for (const service of SERVICES) {
        try {
            console.log(`Checking service: ${service}...`);
            const url = `https://oracle-gateway-1.a.redstone.vip/v2/data-packages/latest/${service}`;
            const res = await axios.get(url, { timeout: 3000 });
            const keys = Object.keys(res.data);
            console.log(`✅ Success for ${service}! Total feeds: ${keys.length}`);
            
            // Check if any feed matches IP or STORY
            const ipFeeds = keys.filter(k => k.toLowerCase().includes('ip'));
            const storyFeeds = keys.filter(k => k.toLowerCase().includes('story'));
            if (ipFeeds.length > 0) console.log(`  - IP matching feeds:`, ipFeeds);
            if (storyFeeds.length > 0) console.log(`  - STORY matching feeds:`, storyFeeds);
        } catch (err: any) {
            console.log(`❌ Failed for ${service}: ${err.message}`);
        }
        console.log("-".repeat(40));
    }
}

checkFeeds();
