async function runAuthTest() {
    const BASE_URL = 'http://localhost:3000/api';
    // 1. Create a variable to hold the random username
    const randomUsername = "testuser_" + Date.now();

    try {
        // 1. Register User
        console.log("--- Registering User ---");
        const regRes = await fetch(`${BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: randomUsername, // Use the variable here
                email: `test_${Date.now()}@example.com`,
                password: "password123",
                accountName: "Demo Account"
            })
        });

        if (regRes.status !== 201) {
            console.log("Registration failed");
            return;
        }
        console.log("Registration Success!");

        // 2. Login User
        console.log("\n--- Logging In ---");
        const loginRes = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: randomUsername, // Use the same variable here
                password: "password123"
            })
        });
        
        const loginData = await loginRes.json();
        if (loginRes.status === 200) {
            console.log("Login Success! Token:", loginData.token.substring(0, 20) + "...");
        } else {
            console.log("Login Failed:", loginData.error);
        }
    } catch (err) {
        console.error("Test Error:", err.message);
    }
}
runAuthTest();