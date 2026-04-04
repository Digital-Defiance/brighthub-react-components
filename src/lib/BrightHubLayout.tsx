import { faCircleNodes } from '@awesome.me/kit-a20d532681/icons/classic/thin';
import { THEME_COLORS } from '@brightchain/brightchain-lib';
import {
  BrightChainSubLogo,
  LayoutShell,
  SubLogoHeight,
  SubLogoIconHeight,
} from '@brightchain/brightchain-react-components';
import { BrightHubStrings } from '@brightchain/brighthub-lib';
import {
  useAuth,
  useAuthenticatedApi,
  useI18n,
} from '@digitaldefiance/express-suite-react-components';
import { Box, Button, useTheme } from '@mui/material';
import {
  FC,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import './BrightHub.scss';
import { NotificationBell } from './notifications/NotificationBell';
import { NotificationDropdown } from './notifications/NotificationDropdown';

const BrightHubLayout: FC = () => {
  const { tBranded: t } = useI18n();
  const navigate = useNavigate();
  const api = useAuthenticatedApi();
  const { userData } = useAuth();
  const contrastText = useTheme().palette.primary.contrastText;
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

  const brandConfig = useMemo(
    () => ({
      appName: 'BrightHub',
      logo: (
        <BrightChainSubLogo
          subText="Hub"
          icon={faCircleNodes}
          iconColor={contrastText}
          height={SubLogoHeight}
          iconHeight={SubLogoIconHeight}
          leadColor={contrastText}
        />
      ),
      primaryColor: THEME_COLORS.CHAIN_BLUE,
    }),
    [],
  );

  const toolbarActions = (
    <Box display="flex" alignItems="center" gap={1}>
      <Box ref={bellRef} component="span">
        <NotificationBell unreadCount={unreadCount} onClick={handleBellClick} />
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
      <Button
        variant="contained"
        color="inherit"
        onClick={() => navigate('/brighthub')}
        sx={{ color: 'primary.main' }}
      >
        {t(BrightHubStrings.MessagingInbox_Title)}
      </Button>
    </Box>
  );

  return (
    <LayoutShell brandConfig={brandConfig} toolbarActions={toolbarActions} />
  );
};

export default memo(BrightHubLayout);
