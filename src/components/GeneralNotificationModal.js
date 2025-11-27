import { useState } from 'react';
import { dbFirestore } from '../connections/ConnFirebaseServices';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';

function GeneralNotificationModal({ isVisible, onClose }) {
    const [generalMessage, setGeneralMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleSendNotification = async (e) => {
        e.preventDefault();
        
        if (!generalMessage.trim()) {
            toast.error('Please enter a message', { position: 'top-right' });
            return;
        }

        setIsSending(true);

        try {
            const generalNotificationRef = collection(dbFirestore, 'GeneralNotification');
            
            await addDoc(generalNotificationRef, {
                createdAt: Timestamp.now(),
                generalMessage: generalMessage.trim()
            });

            toast.success('General notification sent successfully!', { 
                position: 'top-right',
                autoClose: 3000 
            });

            setGeneralMessage('');
            onClose();
        } catch (error) {
            console.error('Error sending general notification:', error);
            toast.error(`Error sending notification: ${error.message}`, { 
                position: 'top-right' 
            });
        } finally {
            setIsSending(false);
        }
    };

    const handleClose = () => {
        if (!isSending) {
            setGeneralMessage('');
            onClose();
        }
    };

    if (!isVisible) return null;

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal notification-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title">
                            General Notification
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Send a notification to all employees
                        </p>
                    </div>
                    <button 
                        onClick={handleClose}
                        className="modal-close"
                        disabled={isSending}
                    >
                        ×
                    </button>
                </div>

                <form onSubmit={handleSendNotification} className="space-y-4">
                    <div className="form-group">
                        <label className="form-label">
                            Message *
                        </label>
                        <textarea
                            value={generalMessage}
                            onChange={(e) => setGeneralMessage(e.target.value)}
                            className="form-textarea"
                            rows={6}
                            cols={40}
                            maxLength={240}
                            required
                            disabled={isSending}
                            placeholder="Enter notification message (max 240 characters)..."
                        />
                        <div className="text-xs text-gray-500 mt-1">
                            {generalMessage.length} / 240 characters
                        </div>
                    </div>

                    <div className="flex gap-4 pt-4 border-t">
                        <button 
                            type='submit'
                            className="btn btn-primary flex-1"
                            disabled={isSending || !generalMessage.trim()}
                        >
                            {isSending ? (
                                <>
                                    <span className="spinner"></span>
                                    Sending...
                                </>
                            ) : (
                                <>
                                    Send Notification
                                </>
                            )}
                        </button>
                        <button 
                            type="button"
                            onClick={handleClose}
                            className="btn btn-secondary"
                            disabled={isSending}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default GeneralNotificationModal;
