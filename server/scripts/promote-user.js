const promoteUser = async (userId, newRole, token) => {
  try {
    const response = await fetch(`http://localhost:3000/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: newRole })
    });

    const data = await response.json();
    if (response.ok) {
      console.log('Success:', data.message);
    } else {
      console.error('Error:', data.error);
    }
  } catch (err) {
    console.error('Promotion failed:', err);
  }
};

// Example Usage:
// promoteUser('64a1b2c3d4e5f6g7h8i9j0k1', 'author', 'YOUR_JWT_TOKEN');
module.exports = { promoteUser }; 