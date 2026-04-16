const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        match: [/.+\@.+\..+/, 'Please enter a valid email address']
    },
    password: {
        type: String,
        required: true,
    },
    profilePicture: {
        type: String,
        default: '/images/default-profile-picture.jpeg',
    },
});

module.exports = mongoose.model('User', UserSchema);
