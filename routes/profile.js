
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');


// GET /profile (with token passed via Authorization header or query param)
router.get('/profile', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).send('User not found');
    }

    res.render('profile', { user });
  } catch (err) {
    console.error('Error fetching profile:', err.message, err.stack); // Add stack for debugging
    res.status(500).send('Server error');
  }
});


// POST /update-profile (also protected with auth middleware)
router.post('/update-profile', auth, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const userId = req.user.id || req.user._id;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).send('User not found');
        }

        user.username = name;
        user.email = email;
        if (password) {
            user.password = password; // hashed password handled in the model
        }

        await user.save();
        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
