import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";

import User from "./models/User.js"
import Subreddit from './models/Subreddit.js';
import Thread from './models/Thread.js';


async function initializeDatabase() {
  try {
    dotenv.config();
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected successfully to database");
  } catch (error) {
    console.error("Failed to connect to database:", error);
    process.exit(1);
  }
}

async function clearExistingData() {
  try {
    console.log("Clearing existing data...");
    await Promise.all([
      User.deleteMany({}),
      Subreddit.deleteMany({}),
      Thread.deleteMany({}),
    ]);
    console.log("Existing data cleared successfully");
  } catch (error) {
    console.error("Error clearing existing data:", error);
    throw error;
  }
}

async function insertData(schemaModel, jsonFile) {
  try {
    const jsonData = JSON.parse(await fs.promises.readFile(jsonFile, "utf-8"));
    await schemaModel.insertMany(jsonData);
    console.log(`Data from "${jsonFile}" inserted successfully!`);
  } catch (err) {
    console.error(`Error inserting data from "${jsonFile}":`, err);
    throw err;
  }
}

async function insertAllData() {
  try {
    await insertData(User, "data/users.json");
    await insertData(Subreddit, "data/subreddits.json");
    await insertData(Thread, "data/threads.json");
    console.log("All data inserted successfully!");
  } catch (error) {
    console.error("Error inserting data:", error);
    throw error;
  }
}

async function main() {
  try {
    await initializeDatabase();
    await clearExistingData();
    await insertAllData();
  } catch (error) {
    console.error("Database population failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed");
  }
}

main();
