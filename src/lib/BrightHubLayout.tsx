import { faCircleNodes } from '@awesome.me/kit-a20d532681/icons/classic/thin';
import { BrightChainSubLogo } from '@brightchain/brightchain-react-components';
import { BrightHubStrings } from '@brightchain/brighthub-lib';
import {
  useAuth,
  useAuthenticatedApi,
  useI18n,
} from '@digitaldefiance/express-suite-react-components';
import { Box, Button, Container } from '@mui/material';
import { FC, memo, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import './BrightHub.scss';
import { NotificationBell } from './notifications/NotificationBell';
import { NotificationDropdown } from './notifications/NotificationDropdown';

const BrightHubLayout: FC = () => {
  const { tBranded: t } = useI18n();
  const navigate = useNavigate();
  const api = useAuthenticatedApi();
  const { userData } = useAuth();
  const userId = userData?.id;

  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<never[]>([]);
  const bellRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!userId) return;
    api
      .get(`/brighthub/notifications?userId=${userId}&limit=10`)
      .then((res) => {
        const data = res.data?.data;
        if (Array.isArray(data)) {
          setNotifications(data as never[]);
          setUnreadCount(
            (data as { isRead?: boolean }[]).filter((n) => !n.isRead).length,
          );
        } else if (data?.notifications) {
          setNotifications(data.notifications as never[]);
          setUnreadCount(data.unreadCount ?? 0);
        }
      })
      .catch(() => {});
  }, [api, userId]);

  const handleBellClick = useCallback(() => {
    setDropdownOpen((prev) => !prev);
  }, []);

  return (
    <Container maxWidth="lg">
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        my={2}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <BrightChainSubLogo
            subText="Hub"
            icon={faCircleNodes}
            height={30}
            iconHeight={20}
          />
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <Box ref={bellRef} component="span">
            <NotificationBell
              unreadCount={unreadCount}
              onClick={handleBellClick}
            />
          </Box>
          <NotificationDropdown
            open={dropdownOpen}
            anchorEl={bellRef.current}
            notifications={notifications}
            onClose={() => setDropdownOpen(false)}
            onViewAll={() => {
              setDropdownOpen(false);
              navigate('/brighthub/notifications');
            }}
            onMarkAllRead={() => {
              if (userId) {
                api
                  .post('/brighthub/notifications/mark-all-read', { userId })
                  .catch(() => {});
              }
              setUnreadCount(0);
            }}
          />
          <Button variant="contained" onClick={() => navigate('/brighthub')}>
            {t(BrightHubStrings.MessagingInbox_Title)}
          </Button>
        </Box>
      </Box>
      <Outlet />
    </Container>
  );
};

export default memo(BrightHubLayout);
