#!/bin/bash
curl -X POST http://localhost:3000/api/login \
     -H "Content-Type: application/json" \
     -d '{
           "username": "demoUser",
           "password": "securePassword123"
         }'