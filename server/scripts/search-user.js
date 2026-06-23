const searchUser = async (query, token) => {
  try {
    const response = await fetch(`http://localhost:3000/api/admin/users?query=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('Search Results:', data);
  } catch (err) {
    console.error('Search failed:', err);
  }
};

// Example Usage:
// searchUser('johndoe', 'YOUR_JWT_TOKEN');
module.exports = { searchUser }; // or promoteUser