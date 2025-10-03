import { usePlaidLink } from 'react-plaid-link';
import { useState, useEffect } from 'react';
import { useAuth } from '~/contexts/AuthContext';

interface PlaidLinkButtonProps {
  onSuccess: (publicToken: string, metadata: any) => void;
  onError?: (error: any) => void;
}

export function PlaidLinkButton({ onSuccess, onError }: PlaidLinkButtonProps) {
  const { user, getIdToken } = useAuth();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Get link token from our API
  const getLinkToken = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) {
        throw new Error('Failed to get authentication token');
      }

      const response = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get link token');
      }

      const data = await response.json();
      setLinkToken(data.link_token);
    } catch (error) {
      console.error('Error getting link token:', error);
      onError?.(error);
      setLoading(false);
    }
  };

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token, metadata) => {
      console.log('Plaid Link success:', metadata);
      onSuccess(public_token, metadata);
      setLinkToken(null); // Reset for next use
    },
    onExit: (err, metadata) => {
      console.log('Plaid Link exit:', err, metadata);
      setLoading(false);
      setLinkToken(null); // Reset for next use
    },
    onEvent: (eventName, metadata) => {
      console.log('Plaid Link event:', eventName, metadata);
    },
  });

  // Auto-open Plaid Link when token is ready
  useEffect(() => {
    if (ready && linkToken) {
      setLoading(false);
      open();
    }
  }, [ready, linkToken, open]);

  const handleClick = async () => {
    if (!linkToken && !loading) {
      await getLinkToken();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading || !user}
      className="flex items-center justify-center gap-3 bg-[#41A6AC] text-white px-6 py-3 rounded-lg hover:bg-[#369399] transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? (
        <>
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
          Loading...
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          Connect Bank Account
        </>
      )}
    </button>
  );
}