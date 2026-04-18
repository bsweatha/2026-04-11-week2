import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Subreddit from '../models/Subreddit.js';
import Thread from '../models/Thread.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('Error: MONGODB_URI is not defined in .env file');
    process.exit(1);
}

const runTests = async () => {
    let successCount = 0;
    let failCount = 0;

    const assert = (condition, message) => {
        if (condition) {
            successCount++;
            console.log(`✅ PASS: ${message}`);
        } else {
            failCount++;
            console.error(`❌ FAIL: ${message}`);
        }
    };

    try {
        console.log('Connecting to MongoDB for testing...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected.');

        // Cleanup before tests
        await User.deleteMany({ email: /test.*@example\.com/ });
        await Subreddit.deleteMany({ name: /test-subreddit/ });
        await Thread.deleteMany({ title: /Test Thread/ });

        let testUser, testSubreddit, testThread;

        console.log('\n--- Starting 20 CRUD Tests ---\n');

        // --- USER TESTS (6) ---
        
        // 1. Create User
        testUser = await User.create({
            name: 'Test User',
            email: 'test-user@example.com',
            password: 'password123'
        });
        assert(testUser._id, 'Should create a new user');

        // 2. Read User by ID
        const foundUser = await User.findById(testUser._id);
        assert(foundUser.name === 'Test User', 'Should find user by ID');

        // 3. Read User by Email
        const userByEmail = await User.findOne({ email: 'test-user@example.com' });
        assert(userByEmail.email === 'test-user@example.com', 'Should find user by email');

        // 4. Update User Name
        testUser.name = 'Updated User';
        await testUser.save();
        const updatedUser = await User.findById(testUser._id);
        assert(updatedUser.name === 'Updated User', 'Should update user name');

        // 5. Update User Password
        await User.updateOne({ _id: testUser._id }, { password: 'newpassword' });
        const userWithNewPass = await User.findById(testUser._id);
        assert(userWithNewPass.password === 'newpassword', 'Should update user password via updateOne');

        // 6. Delete User (cleanup later)
        const deleteRes = await User.deleteOne({ _id: testUser._id });
        assert(deleteRes.deletedCount === 1, 'Should delete user');
        // Re-create user for dependent tests
        testUser = await User.create({ name: 'Test User', email: 'test-user2@example.com', password: 'password123' });

        // --- SUBREDDIT TESTS (6) ---

        // 7. Create Subreddit
        testSubreddit = await Subreddit.create({
            name: 'test-subreddit',
            description: 'A test subreddit',
            author: testUser._id
        });
        assert(testSubreddit.name === 'test-subreddit', 'Should create a subreddit');

        // 8. Read Subreddit by Name
        const subByName = await Subreddit.findOne({ name: 'test-subreddit' });
        assert(subByName.description === 'A test subreddit', 'Should find subreddit by name');

        // 9. Read Subreddits by Author
        const subsByAuthor = await Subreddit.find({ author: testUser._id });
        assert(subsByAuthor.length > 0, 'Should find subreddits by author');

        // 10. Update Subreddit Description
        await Subreddit.findByIdAndUpdate(testSubreddit._id, { description: 'Updated description' });
        const updatedSub = await Subreddit.findById(testSubreddit._id);
        assert(updatedSub.description === 'Updated description', 'Should update subreddit description');

        // 11. Read All Subreddits
        const allSubs = await Subreddit.find({});
        assert(allSubs.length > 0, 'Should return a list of subreddits');

        // 12. Delete Subreddit
        const subDelete = await Subreddit.findByIdAndDelete(testSubreddit._id);
        assert(subDelete !== null, 'Should find and delete subreddit');
        // Re-create subreddit for threads
        testSubreddit = await Subreddit.create({ name: 'test-subreddit-fixed', author: testUser._id });

        // --- THREAD TESTS (8) ---

        // 13. Create Thread
        testThread = await Thread.create({
            title: 'Test Thread Title',
            content: 'This is a test thread content',
            author: testUser._id,
            subreddit: testSubreddit._id
        });
        assert(testThread.title === 'Test Thread Title', 'Should create a thread');

        // 14. Read Thread by ID
        const threadById = await Thread.findById(testThread._id);
        assert(threadById.content === 'This is a test thread content', 'Should find thread by ID');

        // 15. Read Threads in Subreddit
        const threadsInSub = await Thread.find({ subreddit: testSubreddit._id });
        assert(threadsInSub.length === 1, 'Should find threads for a specific subreddit');

        // 16. Update Thread Title
        testThread.title = 'Updated Thread Title';
        await testThread.save();
        const updatedThread = await Thread.findById(testThread._id);
        assert(updatedThread.title === 'Updated Thread Title', 'Should update thread title');

        // 17. Increment Upvotes
        await Thread.updateOne({ _id: testThread._id }, { $inc: { upvotes: 1 } });
        const threadUpvoted = await Thread.findById(testThread._id);
        assert(threadUpvoted.upvotes === 1, 'Should increment thread upvotes');

        // 18. Update Vote Count
        await Thread.updateOne({ _id: testThread._id }, { voteCount: 5 });
        const threadVoteCount = await Thread.findById(testThread._id);
        assert(threadVoteCount.voteCount === 5, 'Should update thread vote count');

        // 19. Find Threads by Author
        const threadsByAuthor = await Thread.find({ author: testUser._id });
        assert(threadsByAuthor.length > 0, 'Should find threads by author');

        // 20. Delete Thread
        const threadDelete = await Thread.deleteOne({ _id: testThread._id });
        assert(threadDelete.deletedCount === 1, 'Should delete thread');

        console.log('\n--- Test Summary ---');
        console.log(`Total Tests: ${successCount + failCount}`);
        console.log(`Passed: ${successCount}`);
        console.log(`Failed: ${failCount}`);

        // Final cleanup
        await User.deleteMany({ email: /test.*@example\.com/ });
        await Subreddit.deleteMany({ name: /test-subreddit/ });
        await Thread.deleteMany({ title: /Test Thread/ });

    } catch (error) {
        console.error('Unexpected error during tests:', error);
    } finally {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
        process.exit(failCount > 0 ? 1 : 0);
    }
};

runTests();
