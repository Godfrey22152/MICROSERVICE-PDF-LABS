const express  = require('express'); 
const router   = express.Router(); 
const bcrypt   = require('bcrypt'); 
const mongoose = require('mongoose'); 
const auth     = require('../middleware/auth'); 
const User     = require('../models/User'); 
const { connectToDb } = require('../config/db'); 
 
// ── Shared processed-file schema ─────────────────────────────────────────── 
const activitySchema = new mongoose.Schema({ 
  userId:         { type: mongoose.Schema.Types.Mixed }, 
  format:         { type: String }, 
  sourceFilename: { type: String }, 
  outputFilename: { type: String }, 
  originalName:   { type: String }, 
  operation:      { type: String }, 
  createdAt:      { type: Date, default: Date.now }, 
}, { strict: false }); 
 
// ── All external service databases and their collections ─────────────────── 
const EXTERNAL_DBS = [ 
  { dbName: 'pdf-to-image-service',   collection: 'processedfiles'    }, 
  { dbName: 'image-to-pdf-service',   collection: 'processedpdffiles' }, 
  { dbName: 'pdf-compressor-service', collection: 'compressedfiles'   }, 
  { dbName: 'pdf-to-audio-service',   collection: 'processedaudios'   }, 
  { dbName: 'pdf-to-word-service',    collection: 'convertedfiles'    }, 
  { dbName: 'word-to-pdf-service',    collection: 'wordtopdffiles'    }, 
  { dbName: 'edit-pdf-service',       collection: 'editedfiles'       }, 
  { dbName: 'sheetlab-service',       collection: 'convertedfiles'    }, 
]; 
 
// ── Fetch activity for a user across all service databases ───────────────── 
async function fetchAllActivity(userId) { 
  const userIdStr = String(userId); 
 
  const promises = EXTERNAL_DBS.map(async ({ dbName, collection }) => { 
    let conn; 
    try { 
      conn = connectToDb(dbName); 
      const Model = conn.model('Activity', activitySchema, collection); 
 
      const docs = await Model.find({ 
        $or: [ 
          { userId: userIdStr }, 
          { userId: new mongoose.Types.ObjectId(userIdStr) }, 
        ], 
      }).lean(); 
 
      return docs.map(doc => { 
        if (!doc.createdAt && doc._id) { 
          doc.createdAt = doc._id.getTimestamp(); 
        } 
        // Normalize filename fields so they always show in the UI
        if (!doc.originalName) {
            doc.originalName = doc.filename || doc.file_name || doc.name || doc.sourceFilename;
        }
        doc._source = dbName; 
        return doc; 
      }); 
    } catch (err) { 
      console.warn(`Could not fetch from ${dbName}:`, err.message); 
      return []; 
    } finally { 
      if (conn) await conn.close(); 
    } 
  }); 
 
  const results = await Promise.all(promises); 
  return results 
    .flat() 
    .filter(Boolean) 
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); 
} 
 
// ── Delete all activity for a user across all service databases ──────────── 
async function deleteAllActivity(userId) { 
  const userIdStr = String(userId); 
 
  const promises = EXTERNAL_DBS.map(async ({ dbName, collection }) => { 
    let conn; 
    try { 
      conn = connectToDb(dbName); 
      const Model = conn.model('Activity', activitySchema, collection); 
 
      await Model.deleteMany({ 
        $or: [ 
          { userId: userIdStr }, 
          { userId: new mongoose.Types.ObjectId(userIdStr) }, 
        ], 
      }); 
      console.log(`[Profile] Activity deleted from ${dbName}`); 
    } catch (err) { 
      console.warn(`Could not delete from ${dbName}:`, err.message); 
    } finally { 
      if (conn) await conn.close(); 
    } 
  }); 
 
  await Promise.all(promises); 
} 
 
// ── Human-readable activity label ────────────────────────────────────────── 
function activityLabel(doc) { 
  const source = doc._source || ''; 
  if (source.includes('pdf-to-image'))   return 'Converted PDF to Image'; 
  if (source.includes('image-to-pdf'))   return 'Converted Image to PDF'; 
  if (source.includes('pdf-compressor')) return 'Compressed a PDF'; 
  if (source.includes('pdf-to-audio'))   return 'Converted PDF to Audio'; 
  if (source.includes('pdf-to-word'))    return 'Converted PDF to Word'; 
  if (source.includes('word-to-pdf'))    return 'Converted Word to PDF'; 
  if (source.includes('edit-pdf'))       return `Edited PDF${doc.operation ? ' — ' + doc.operation : ''}`; 
  if (source.includes('sheetlab'))       return 'Processed a Spreadsheet'; 
  if (doc.format === 'pdf')              return 'Converted Image to PDF'; 
  if (doc.format)                        return `Converted PDF to ${doc.format.toUpperCase()}`; 
  return 'Processed a file'; 
} 
 
// ── Service base URL mapping ─────────────────────────────────────────────── 
function activityUrl(doc) { 
  const source = doc._source || ''; 
  if (source.includes('pdf-to-image'))   return 'http://localhost:5100/tools/pdf-to-image'; 
  if (source.includes('image-to-pdf'))   return 'http://localhost:5200/tools/image-to-pdf'; 
  if (source.includes('pdf-compressor')) return 'http://localhost:5300/tools/pdf-compressor'; 
  if (source.includes('pdf-to-audio'))   return 'http://localhost:5400/tools/pdf-to-audio'; 
  if (source.includes('pdf-to-word'))    return 'http://localhost:5500/tools/pdf-to-word'; 
  if (source.includes('word-to-pdf'))    return 'http://localhost:5700/tools/word-to-pdf'; 
  if (source.includes('edit-pdf'))       return 'http://localhost:5800/tools/edit-pdf'; 
  if (source.includes('sheetlab'))       return 'http://localhost:5600/tools/sheetlab'; 
  return null; 
} 
 
// ── GET /profile ─────────────────────────────────────────────────────────── 
router.get('/profile', auth, async (req, res) => { 
  try { 
    const userId = req.user.id || req.user._id; 
    const user   = await User.findById(userId).lean(); 
 
    if (!user) { 
      if (req.accepts('html')) return res.redirect('http://localhost:3000'); 
      return res.status(404).json({ 
        error: true, 
        type:  'USER_DELETED', 
        msg:   'Something just happened — user no longer found or deleted.', 
      }); 
    } 
 
    const recentActivity = await fetchAllActivity(userId); 
    const token = req.token || req.query.token || ''; 
 
    res.render('profile', { user, recentActivity, activityLabel, activityUrl, token }); 
  } catch (err) { 
    console.error('Error fetching profile:', err); 
    if (req.accepts('html')) return res.redirect('http://localhost:3000'); 
    res.status(500).json({ 
      error: true, 
      type:  'SERVER_ERROR', 
      msg:   'An unexpected error occurred. Please try again.', 
    }); 
  } 
}); 
 
// ── POST /update-profile ─────────────────────────────────────────────────── 
router.post('/update-profile', auth, async (req, res) => { 
  try { 
    const name     = (req.body.name     || '').trim(); 
    const email    = (req.body.email    || '').trim().toLowerCase(); 
    const password = (req.body.password || '').trim(); 
 
    if (!name || !email) { 
      return res.status(400).json({ msg: 'Name and email are required' }); 
    } 
 
    const userId = req.user.id || req.user._id; 
    const user   = await User.findById(userId); 
 
    if (!user) { 
      return res.status(404).json({ 
        error: true, 
        type:  'USER_DELETED', 
        msg:   'Something just happened — user no longer found or deleted.', 
      }); 
    } 
 
    user.username = name; 
    user.email    = email; 
    if (password) { 
      user.password = bcrypt.hashSync(password, 10); 
    } 
 
    await user.save(); 
    res.json({ msg: 'Profile updated successfully' }); 
  } catch (err) { 
    console.error(err); 
    res.status(500).json({ msg: 'Internal Server Error' }); 
  } 
}); 
 
// ── DELETE /delete-account ───────────────────────────────────────────────── 
router.delete('/delete-account', auth, async (req, res) => { 
  try { 
    const userId = req.user.id || req.user._id; 
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: true,
        msg: 'Password is required to delete your account.'
      });
    }

    const user = await User.findById(userId); 
 
    if (!user) { 
      return res.status(404).json({ 
        error: true, 
        type:  'USER_DELETED', 
        msg:   'Account not found — it may have already been deleted.', 
      }); 
    } 

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(403).json({
        error: true,
        msg: 'Incorrect password. Account deletion aborted.'
      });
    }
 
    await User.findByIdAndDelete(userId); 
    await deleteAllActivity(userId);
    console.log('[Profile] Account and all activity deleted for userId:', userId); 
 
    res.json({ 
      success: true, 
      msg:     'Your account has been permanently deleted.', 
    }); 
  } catch (err) { 
    console.error('[Profile] Error deleting account:', err); 
    res.status(500).json({ 
      error: true, 
      type:  'SERVER_ERROR', 
      msg:   'An error occurred while deleting your account. Please try again.', 
    }); 
  } 
}); 
 
module.exports = router;
