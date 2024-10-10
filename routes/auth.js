const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('config');

// Register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        let user = await User.findOne({ username });
        if (user) {
            return res.status(400).send('User already exists');
        }
        user = new User({ username, email, password: bcrypt.hashSync(password, 10) });
        await user.save();
        res.status(201).send('Account created, You can now Login');
    } catch (err) {
        res.status(500).send('Email Already Exists');
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        let user = await User.findOne({ username });
        if (!user) {
            return res.status(400).send('Invalid credentials, Check Your Details and Try Again');
        }
        const isMatch = bcrypt.compareSync(password, user.password);
        if (!isMatch) {
            return res.status(400).send('Invalid credentials, Check Your Details and Try Again');
        }

        // Create a payload and generate a token
        const payload = { user: { id: user.id, username: user.username } };
        jwt.sign(
            payload,
            config.get('jwtSecret'),
            { expiresIn: '1h' }, // Token expires in 1 hour
            (err, token) => {
                if (err) throw err;
                res.json({ token, redirectUrl: 'http://localhost:4000' });
            }
        );
    } catch (err) {
        res.status(500).send('Server error');
    }
});

module.exports = router;
