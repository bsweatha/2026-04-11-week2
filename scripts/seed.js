import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Import Models
import User from '../models/User.js';
import Subreddit from '../models/Subreddit.js';
import Thread from '../models/Thread.js';

// Setup __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('Error: MONGODB_URI is not defined in .env file');
    process.exit(1);
}

const loadData = (filename) => {
    const filePath = path.join(__dirname, '../data', filename);
    const rawData = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(rawData);
};

const seedDatabase = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB.');

        // 1. Clear existing data
        console.log('Clearing existing data...');
        await User.deleteMany({});
        await Subreddit.deleteMany({});
        await Thread.deleteMany({});
        console.log('Existing data cleared.');

        // 2. Load data from JSON files
        const userData = loadData('users.json');
        const subredditData = loadData('subreddits.json');
        const threadData = loadData('threads.json');

        // 3. Insert Users
        console.log(`Seeding ${userData.length} users...`);
        // Map EJSON to Mongoose
        const users = userData.map(u => ({
            ...u,
            _id: new mongoose.Types.ObjectId(u._id.$oid),
            createdAt: new Date(u.createdAt.$date)
        }));
        await User.insertMany(users);
        console.log('Users seeded successfully.');

        // 4. Insert Subreddits
        console.log(`Seeding ${subredditData.length} subreddits...`);
        const subreddits = subredditData.map(s => ({
            ...s,
            _id: new mongoose.Types.ObjectId(s._id.$oid),
            author: new mongoose.Types.ObjectId(s.author.$oid),
            createdAt: new Date(s.createdAt.$date)
        }));
        await Subreddit.insertMany(subreddits);
        console.log('Subreddits seeded successfully.');

        // 5. Insert Threads
        console.log(`Seeding ${threadData.length} threads...`);
        const threads = threadData.map(t => ({
            ...t,
            _id: new mongoose.Types.ObjectId(t._id.$oid),
            author: new mongoose.Types.ObjectId(t.author.$oid),
            subreddit: new mongoose.Types.ObjectId(t.subreddit.$oid),
            createdAt: new Date(t.createdAt.$date)
        }));
        await Thread.insertMany(threads);
        console.log('Threads seeded successfully.');

        console.log('Database seeding completed successfully!');
    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
        process.exit();
    }
};

seedDatabase();
