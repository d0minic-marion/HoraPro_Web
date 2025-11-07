import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import QRCode from 'react-qr-code';

import { dbFirestore } from '../connections/ConnFirebaseServices';
import './QrDisplayPage.css';

const TOKEN_COLLECTION = 'qrTokens';
const TOKEN_DOCUMENT = 'current';

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
  const [tokenValue, setTokenValue] = useState('');
  const [status, setStatus] = useState('loading');
  const [issuedAt, setIssuedAt] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [writerError, setWriterError] = useState('');
  const rotationTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const tokenDocRef = useMemo(
    () => doc(dbFirestore, TOKEN_COLLECTION, TOKEN_DOCUMENT),
    [dbFirestore],
  );

  useEffect(() => {
    setStatus('loading');
    const unsubscribe = onSnapshot(
      tokenDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setTokenValue('');
          setIssuedAt(null);
          setExpiresAt(null);
          setStatus('missing');
          return;
        }

        const data = snapshot.data();
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
  }, [tokenDocRef]);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const rotateToken = useCallback(async () => {
    const issued = new Date();
    const expires = new Date(issued.getTime() + 60_000);

    try {
      await setDoc(tokenDocRef, {
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
  }, [tokenDocRef]);

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
        <h1 className="qr-display-title">Shift Check-In QR</h1>
        <p className="qr-display-subtitle">
          Present this code to validate clock-in and clock-out events.
        </p>
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
