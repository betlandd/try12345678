import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { Check, X, Clock, AlertCircle, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

type Proof = {
  id: number;
  proof_uri: string;
  proof_hash: string;
  participant_id?: string;
  uploaded_at?: string;
};

type Vote = {
  userId: string;
  choice: 'challenger' | 'challenged';
  timestamp: string;
};

interface P2PChallengeTradeProps {
  challengeId: number;
  challenge: any;
  onVote?: () => void;
  userRole: 'challenger' | 'challenged' | null;
}

export default function P2PChallengeTradePanel({
  challengeId,
  challenge,
  onVote,
  userRole,
}: P2PChallengeTradeProps) {
  const { user } = useAuth();
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [votes, setVotes] = useState<{ [key: string]: Vote }>({});
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedProof, setSelectedProof] = useState<Proof | null>(null);
  const [myVote, setMyVote] = useState<'challenger' | 'challenged' | null>(null);
  const [countdownTime, setCountdownTime] = useState<number | null>(null);
  const [showDisputeMenu, setShowDisputeMenu] = useState(false);
  const [status, setStatus] = useState<'uploading' | 'voting' | 'released' | 'disputed' | 'auto-released' | null>(null);

  // Calculate countdown from challenge due date
  useEffect(() => {
    if (!challenge?.dueDate) return;
    
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const due = new Date(challenge.dueDate).getTime();
      const remaining = Math.max(0, due - now);
      setCountdownTime(remaining);
      
      if (remaining === 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [challenge?.dueDate]);

  useEffect(() => {
    fetchProofs();
    fetchVotes();
  }, [challengeId]);

  async function fetchProofs() {
    try {
      const res = await fetch(`/api/challenges/${challengeId}/proofs`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setProofs(data || []);
    } catch (err) {
      console.error('Error fetching proofs:', err);
    }
  }

  async function fetchVotes() {
    try {
      const res = await fetch(`/api/admin/challenges/${challengeId}/votes`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const voteMap: { [key: string]: Vote } = {};
      data.forEach((v: any) => {
        voteMap[v.userId] = {
          userId: v.userId,
          choice: v.choice,
          timestamp: v.timestamp,
        };
      });
      setVotes(voteMap);

      // Check if votes match for auto-release
      if (Object.keys(voteMap).length === 2) {
        const voteChoices = Object.values(voteMap).map(v => v.choice);
        if (voteChoices[0] === voteChoices[1]) {
          setStatus('auto-released');
        }
      }
    } catch (err) {
      console.error('Error fetching votes:', err);
    }
  }

  async function handleFile(file: File) {
    setUploading(true);
    setProgress(5);
    setStatus('uploading');

    try {
      // Upload file
      const form = new FormData();
      form.append('image', file);
      const uploadRes = await fetch('/api/upload/image', { method: 'POST', credentials: 'include', body: form });
      if (!uploadRes.ok) {
        alert('Upload failed');
        setUploading(false);
        setStatus(null);
        return;
      }
      const uploadJson = await uploadRes.json();
      setProgress(40);

      // Compute hash
      const arrayBuffer = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuf));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setProgress(60);

      // Register proof
      const proof = await apiRequest('POST', `/api/challenges/${challengeId}/proofs`, {
        proofUri: uploadJson.imageUrl,
        proofHash: hashHex,
      });
      setProgress(90);
      await fetchProofs();
      setUploading(false);
      setProgress(100);
      setTimeout(() => setProgress(0), 700);
      setSelectedProof(proof);
      setStatus('voting');
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('Upload failed');
      setUploading(false);
      setStatus(null);
    }
  }

  async function handleVote(choice: 'challenger' | 'challenged') {
    if (!selectedProof) {
      alert('Please select a proof first');
      return;
    }

    try {
      await apiRequest('POST', `/api/challenges/${challengeId}/vote`, {
        voteChoice: choice,
        proofHash: selectedProof.proof_hash,
      });
      setMyVote(choice);
      await fetchVotes();
    } catch (err) {
      console.error('Error voting:', err);
      alert('Vote failed');
    }
  }

  async function handleOpenDispute() {
    try {
      await apiRequest('POST', `/api/challenges/${challengeId}/dispute`, {});
      setStatus('disputed');
      setShowDisputeMenu(false);
    } catch (err: any) {
      alert(err?.message || 'Failed to open dispute');
    }
  }

  function openFilePicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = async () => {
      if (!input.files || input.files.length === 0) return;
      await handleFile(input.files[0]);
    };
    input.click();
  }

  const opponentId = userRole === 'challenger' ? challenge?.challengedUser?.id : challenge?.challengerUser?.id;
  const opponentName = userRole === 'challenger' ? challenge?.challengedUser?.firstName || challenge?.challengedUser?.username : challenge?.challengerUser?.firstName || challenge?.challengerUser?.username;
  const opponentHasVoted = opponentId && !!votes[opponentId];
  const currentUserVote = user?.id && votes[user.id];
  const bothVoted = Object.keys(votes).length === 2;
  const votesMatch = bothVoted && Object.values(votes).every((v: Vote) => v.choice === Object.values(votes)[0].choice);

  const formatCountdown = (ms: number | null) => {
    if (ms === null || ms <= 0) return 'Expired';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 shadow-md">
      {/* Header with Status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold">P2P Trade</h3>
          <div className="flex items-center gap-2">
            {status === 'auto-released' && (
              <>
                <Check className="w-5 h-5 text-green-500" />
                <span className="text-sm font-semibold text-green-600 dark:text-green-400">Released</span>
              </>
            )}
            {status === 'disputed' && (
              <>
                <AlertCircle className="w-5 h-5 text-orange-500" />
                <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">Disputed</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <Clock className="w-4 h-4" />
          <span>{formatCountdown(countdownTime)}</span>
        </div>
      </div>

      {/* Proofs Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Proofs</h4>
          <span className="text-xs text-slate-500">{proofs.length} uploaded</span>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2 mb-3">
          {proofs.map((p) => (
            <div
              key={p.id}
              onClick={() => setSelectedProof(p)}
              className={`relative cursor-pointer rounded-lg overflow-hidden transition-all ${
                selectedProof?.id === p.id ? 'ring-2 ring-blue-500 scale-105' : 'hover:opacity-80'
              }`}
            >
              <img src={p.proof_uri} alt="proof" className="w-full h-20 object-cover" />
              {p.participant_id === user?.id && (
                <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-2 py-0.5 rounded">You</div>
              )}
            </div>
          ))}
        </div>

        {/* Upload Button */}
        <Button
          onClick={openFilePicker}
          disabled={uploading || status === 'released' || status === 'disputed'}
          className="w-full mb-2"
        >
          {uploading ? `Uploading ${progress}%` : 'Upload Proof'}
        </Button>

        {uploading && <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded overflow-hidden mb-2">
          <div style={{ width: `${progress}%` }} className="h-2 bg-blue-500 transition-all" />
        </div>}
      </div>

      {/* Voting Section */}
      {selectedProof && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cast Your Vote</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Both must agree to auto-release funds</p>
            </div>
            {currentUserVote && (
              <div className="text-sm font-bold text-green-600 dark:text-green-400">✓ Voted</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => handleVote('challenger')}
              variant={myVote === 'challenger' ? 'default' : 'outline'}
              disabled={!selectedProof || status === 'released' || status === 'disputed'}
              className="text-sm"
            >
              {userRole === 'challenger' ? 'I Won' : 'Challenger Won'}
            </Button>
            <Button
              onClick={() => handleVote('challenged')}
              variant={myVote === 'challenged' ? 'default' : 'outline'}
              disabled={!selectedProof || status === 'released' || status === 'disputed'}
              className="text-sm"
            >
              {userRole === 'challenged' ? 'I Won' : 'Challenged Won'}
            </Button>
          </div>
        </div>
      )}

      {/* Vote Status - Opponent Visibility */}
      <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
        <p className="text-sm font-semibold mb-2">Vote Status</p>
        <div className="space-y-2">
          {/* My Vote */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-700 dark:text-slate-300">
              Your Vote
            </span>
            {currentUserVote ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold">
                <Check className="w-4 h-4" />
                {currentUserVote.choice === 'challenger' ? 'Challenger' : 'Challenged'}
              </div>
            ) : (
              <span className="text-slate-500">Waiting...</span>
            )}
          </div>

          {/* Opponent Vote */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-700 dark:text-slate-300">
              {opponentName}'s Vote
            </span>
            {opponentHasVoted ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold">
                <Check className="w-4 h-4" />
                {votes[opponentId!]?.choice === 'challenger' ? 'Challenger' : 'Challenged'}
              </div>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">⏳ Pending</span>
            )}
          </div>

          {/* Vote Result */}
          {bothVoted && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              {votesMatch ? (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-bold">
                  <Check className="w-4 h-4" />
                  Votes Match - Funds Released ✓
                </div>
              ) : (
                <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold">
                  <X className="w-4 h-4" />
                  Votes Disagree - Dispute Opened
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dispute Menu */}
      {bothVoted && !votesMatch && (
        <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-orange-900 dark:text-orange-100">Vote Mismatch</p>
              <p className="text-xs text-orange-800 dark:text-orange-200">Admin will review evidence and resolve</p>
            </div>
            {!showDisputeMenu && (
              <Button
                onClick={() => setShowDisputeMenu(true)}
                variant="outline"
                size="sm"
                className="text-orange-600 dark:text-orange-400"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            )}
          </div>
          {showDisputeMenu && (
            <div className="mt-3">
              <Button
                onClick={handleOpenDispute}
                variant="destructive"
                className="w-full"
                disabled={status === 'disputed'}
              >
                {status === 'disputed' ? 'Dispute Opened' : 'Open Dispute'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Auto-Release Info */}
      {votesMatch && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
            <p className="font-semibold text-green-900 dark:text-green-100">Transaction Complete</p>
          </div>
          <p className="text-sm text-green-800 dark:text-green-200">
            Funds have been automatically released to {votesMatch ? 'the winner' : 'both parties'}.
          </p>
        </div>
      )}
    </div>
  );
}
