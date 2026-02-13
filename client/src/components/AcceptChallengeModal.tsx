import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import { useToast } from '@/hooks/use-toast';

interface AcceptChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  challenge: any;
  onAccept?: () => Promise<void> | void;
  isSubmitting?: boolean;
}

export function AcceptChallengeModal({
  isOpen,
  onClose,
  challenge,
  onAccept,
  isSubmitting = false,
}: AcceptChallengeModalProps) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  if (!challenge) return null;

  const challenger = challenge.challengerUser || null;

  const handleConfirm = async () => {
    try {
      setError(null);
      if (onAccept) {
        await onAccept();
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to accept challenge');
      toast({
        title: 'Error',
        description: err?.message || 'Failed to accept challenge',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Accept Challenge</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {challenger?.profileImageUrl ? (
              <img
                src={challenger.profileImageUrl}
                alt={challenger.firstName || 'Challenger'}
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <UserAvatar
                userId={challenger?.id}
                username={challenger?.username}
                size={40}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">{challenge.title}</p>
              <p className="text-xs text-slate-500 truncate">
                Accept a challenge from{' '}
                {challenger?.firstName || challenger?.username || 'another user'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Stake: ₦{(parseFloat(String(challenge.amount)) || 0).toLocaleString()}
              </p>
            </div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg text-xs text-slate-600 dark:text-slate-400">
            <p className="font-semibold mb-1">What happens next:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>₦{(parseFloat(String(challenge.amount)) || 0).toLocaleString()} will be held in escrow</li>
              <li>You can upload proofs and vote on the outcome</li>
              <li>If both agree on the outcome, funds release automatically</li>
              <li>If disputed, an admin will review your evidence</li>
            </ul>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="bg-[#ccff00] text-black hover:bg-[#b8e600]"
            >
              {isSubmitting ? 'Accepting...' : 'Accept & Stake'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
