#!/bin/bash
curl -X POST http://localhost:3000/api/register \
     -H "Content-Type: application/json" \
     -d '{
           "username": "demoUser",
           "email": "demoUser@example.com",
           "password": "securePassword123",
           "accountName": "demoUserAccount"
         }'