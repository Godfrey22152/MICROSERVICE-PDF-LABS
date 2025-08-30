const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProcessedFileSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    format: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('ProcessedFile', ProcessedFileSchema);
