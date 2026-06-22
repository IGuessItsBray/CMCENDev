const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function runFullTest() {
    const BASE_URL = 'http://localhost:3000/api';
    const randomUsername = "testuser_" + Date.now();
    const TEST_IMAGE_PATH = path.join(__dirname, '..', '..', 'canada.png');

    try {
        // 1. Register User
        console.log("--- 1. Registering User ---");
        const regRes = await axios.post(`${BASE_URL}/register`, {
            username: randomUsername,
            email: `test_${Date.now()}@example.com`,
            password: "password123",
            accountName: "Demo Account"
        });

        if (regRes.status !== 201) throw new Error("Registration failed");
        console.log("Registration Success!");

        // 2. Login User
        console.log("\n--- 2. Logging In ---");
        const loginRes = await axios.post(`${BASE_URL}/login`, {
            username: randomUsername,
            password: "password123"
        });
        
        const token = loginRes.data.token;
        if (!token) throw new Error("Login failed: No token received");
        console.log("Login Success!");

        // 3. Upload Image
        console.log("\n--- 3. Uploading Image ---");
        const form = new FormData();
        if (!fs.existsSync(TEST_IMAGE_PATH)) {
            throw new Error(`File not found at: ${TEST_IMAGE_PATH}`);
        }
        form.append('image', fs.createReadStream(TEST_IMAGE_PATH));

        // Use axios to post the form with correct headers
        const uploadRes = await axios.post(`${BASE_URL}/upload`, form, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                ...form.getHeaders() 
            }
        });
        
        if (uploadRes.status === 201) {
            console.log("Upload Success!");
            console.log("File Key:", uploadRes.data.key);
            console.log("Public URL: https://cdn.corebot.ca/cmcen-demo/" + uploadRes.data.key);
        } else {
            console.error("Upload Failed:", uploadRes.data);
        }

    } catch (err) {
        console.error("Test Error:", err.response ? err.response.data : err.message);
    }
}

runFullTest();