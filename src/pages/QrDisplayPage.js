import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import QRCode from 'react-qr-code';

import { dbFirestore, authFirebase } from '../connections/ConnFirebaseServices';
import HoraProLogo from '../components/logo/HoraProLogo.png';
import './QrDisplayPage.css';

const TOKEN_COLLECTION = 'qrTokens';

const statusMessageMap = {
  loading: 'Waiting for the QR code…',
  missing: 'No QR token is configured yet.',
  error: 'Unable to load the QR token. Please contact support.',
};

function createTokenValue() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const randomSegment = () => Math.random().toString(36).slice(2, 10);
  return `${randomSegment()}-${Date.now().toString(36)}-${randomSegment()}`;
}

function getNextRotationDelay(expires) {
  if (!expires) {
    return 60_000;
  }

  const millisUntilExpiry = expires.getTime() - Date.now();

  if (Number.isNaN(millisUntilExpiry) || millisUntilExpiry <= 0) {
    return 60_000;
  }

  return Math.min(millisUntilExpiry, 60_000);
}

function formatTimestamp(date) {
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

const QrDisplayPage = () => {
  const navigate = useNavigate();
  const [tokenValue, setTokenValue] = useState('');
  const [status, setStatus] = useState('loading');
  const [issuedAt, setIssuedAt] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [writerError, setWriterError] = useState('');
  const rotationTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const tokenCollectionRef = useMemo(
    () => collection(dbFirestore, TOKEN_COLLECTION),
    [],
  );

  const handleLogout = useCallback(async () => {
    try {
      await signOut(authFirebase);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, [navigate]);

  useEffect(() => {
    setStatus('loading');
    const q = query(
      tokenCollectionRef,
      orderBy('issuedAt', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          setTokenValue('');
          setIssuedAt(null);
          setExpiresAt(null);
          setStatus('missing');
          return;
        }

        const data = snapshot.docs[0].data();
        const nextValue = typeof data.value === 'string' ? data.value : '';
        const issued = data.issuedAt && typeof data.issuedAt.toDate === 'function'
          ? data.issuedAt.toDate()
          : null;
        const expires = data.expiresAt && typeof data.expiresAt.toDate === 'function'
          ? data.expiresAt.toDate()
          : null;

        setTokenValue(nextValue);
        setIssuedAt(issued);
        setExpiresAt(expires);
        setStatus(nextValue ? 'ready' : 'missing');
      },
      () => {
        setTokenValue('');
        setIssuedAt(null);
        setExpiresAt(null);
        setStatus('error');
      },
    );
    return unsubscribe;
  }, [tokenCollectionRef]);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const rotateToken = useCallback(async () => {
    const issued = new Date();
    const expires = new Date(issued.getTime() + 60_000);
    const docId = issued.getTime().toString();

    try {
      const newTokenDocRef = doc(tokenCollectionRef, docId);
      await setDoc(newTokenDocRef, {
        value: createTokenValue(),
        issuedAt: Timestamp.fromDate(issued),
        expiresAt: Timestamp.fromDate(expires),
      });
      if (isMountedRef.current) {
        setWriterError('');
      }
    } catch (err) {
      if (isMountedRef.current) {
        setWriterError('Failed to refresh the QR code. Retrying…');
      }
    }
  }, [tokenCollectionRef]);

  useEffect(() => {
    rotateToken();
  }, [rotateToken]);

  useEffect(() => {
    const delay = getNextRotationDelay(expiresAt);

    clearTimeout(rotationTimerRef.current);
    rotationTimerRef.current = setTimeout(() => {
      rotateToken();
    }, delay);

    return () => {
      clearTimeout(rotationTimerRef.current);
    };
  }, [expiresAt, rotateToken]);

  const activeMessage = useMemo(() => statusMessageMap[status], [status]);

  const issuedAtLabel = useMemo(() => formatTimestamp(issuedAt), [issuedAt]);
  const expiresAtLabel = useMemo(() => formatTimestamp(expiresAt), [expiresAt]);

  const isReady = status === 'ready' && tokenValue;

  return (
    <main className="qr-display-root">
      <div className="qr-display-header">
        <div className="qr-display-logo-box">
          <img
            className="qr-display-logo"
            src={HoraProLogo}
            alt="Logo HoraPro"
          />
        </div>
        <h1 className="qr-display-title">Shift Check-In/Out QR</h1>
        <p className="qr-display-subtitle">
          Present this code to validate clock-in and clock-out events.
        </p>
        
        {/* Logout button - only visible in authenticated QR mode */}
        <button
          onClick={handleLogout}
          className="qr-display-logout-btn"
          aria-label="Logout"
        >
          Logout
        </button>
      </div>

      <section className="qr-display-content">
        <div className={`qr-display-board ${isReady ? '' : 'qr-display-board--inactive'}`}>
          {isReady ? (
            <QRCode value={tokenValue} size={360} bgColor="#ffffff" fgColor="#0b3d60" />
          ) : (
            <span className="qr-display-placeholder">{activeMessage}</span>
          )}
        </div>

        {isReady && (
          <dl className="qr-display-meta">
            {issuedAtLabel && (
              <>
                <dt>Issued</dt>
                <dd>{issuedAtLabel}</dd>
              </>
            )}

            {expiresAtLabel && (
              <>
                <dt>Expires</dt>
                <dd>{expiresAtLabel}</dd>
              </>
            )}
          </dl>
        )}

        {!isReady && (
          <p className="qr-display-status">{activeMessage}</p>
        )}

        {writerError && (
          <p className="qr-display-status qr-display-status--error">{writerError}</p>
        )}
      </section>
    </main>
  );
};

export default QrDisplayPage;
