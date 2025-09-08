const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const ProcessedFile = require('../models/ProcessedFile');

let ProcessedPdfFile = null;
try {
  ProcessedPdfFile = require('../models/ProcessedPdfFile');
} catch (err) {
  // model missing is tolerated. app will still show ProcessedFile entries.
  console.warn('ProcessedPdfFile model not found. Falling back to ProcessedFile only.');
}

// GET /profile (token via Authorization header or query param)
router.get('/profile', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).send('User not found');
    }

    // load both collections in parallel
    const [processedFiles, processedPdfFiles] = await Promise.all([
      ProcessedFile.find({ userId }).lean(),
      ProcessedPdfFile ? ProcessedPdfFile.find({ userId }).lean() : Promise.resolve([])
    ]);

    // normalize minimal fields for pdf collection entries
    const normalizedPdfFiles = (processedPdfFiles || []).map(f => {
      if (!f.format) f.format = 'pdf';
      if (!f.createdAt && f.created_at) { // handle legacy field name
        f.createdAt = f.created_at;
      }
      // Fallback for documents that are missing a timestamp
      if (!f.createdAt && f._id) {
        f.createdAt = f._id.getTimestamp();
      }
      return f;
    });

    // merge and sort newest first
    const combined = [...(processedFiles || []), ...normalizedPdfFiles]
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.render('profile', {
      user,
      processedFiles: combined
    });
  } catch (err) {
    console.error('Error fetching profile:', err);
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
