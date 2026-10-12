/** Run: COMPANYDATA_API_KEY=... npx tsx examples/quickstart.ts */
import { KrsClient } from "../src/index";

const client = new KrsClient({ auth: { type: "apiKey", apiKey: process.env.COMPANYDATA_API_KEY! } });

const company = await client.getByKrs("0000031481");
console.log("By KRS number:", company);

const page = await client.search({ cityName: "Warsaw", hasEmail: true, pageSize: 25 });
console.log("Search:", page.data);
