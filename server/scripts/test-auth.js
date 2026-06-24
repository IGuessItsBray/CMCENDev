async function runAuthTest() {
    const BASE_URL = 'http://localhost:3000/api';
    const testEmail = `test_${Date.now()}@example.com`;

    try {
        // 1. Register User
        console.log("--- Registering User ---");
        const regRes = await fetch(`${BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firstName: "Demo",
                lastName: "Account",
                addressLine1: "1 Test Way",
                addressLine2: "",
                city: "Ottawa",
                country: "Canada",
                stateProvince: "Ontario",
                postalCode: "K1A 0K2",
                rank: "",
                postNominals: "",
                company: "CMCEN",
                status: "civilian",
                affiliationElement: "other",
                trade: "",
                tradeOther: "",
                currentUnit: "",
                email: testEmail,
                password: "password123",
                passwordConfirmation: "password123"
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
                username: testEmail,
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
