/**
 * PostComposer Component
 *
 * Provides a rich text editor for creating new posts with markdown,
 * emoji, and FontAwesome icon support. Includes media attachment upload,
 * character counting, hub visibility selection, and reply/quote context.
 *
 * @remarks
 * Implements Requirement 12.2
 */

import type { ITempUploadResponse } from '@brightchain/brightchain-lib';
import {
  BrightHubStrings,
  countInlineImages,
  getMaxInlineImages,
  IBaseHub,
  IBasePostData,
  IBaseUserProfile,
  INLINE_IMAGE_MIME_TYPES,
} from '@brightchain/brighthub-lib';
import {
  getCharacterCount,
  parsePostContent,
} from '@brightchain/brighthub-lib/lib/brighthub-lib';
import {
  Close,
  Code,
  EmojiEmotions,
  FormatBold,
  FormatItalic,
  HelpOutline,
  Image,
  Send,
  Visibility,
} from '@mui/icons-material';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  ToggleButton,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useBrightHubTranslation } from '../hooks/useBrightHubTranslation';
import { extractMarkdownImages, updateAltText } from './inlineImageUtils';
import { MarkupHelpDialog } from './MarkupHelpDialog';

/** Default maximum character count for a post */
const DEFAULT_MAX_CHAR_COUNT = 280;

/** Maximum character count for hub/long-form posts */
export const HUB_POST_MAX_CHAR_COUNT = 10000;

/** Props for the PostComposer component */
export interface PostComposerProps {
  /** Current user's profile */
  currentUser?: IBaseUserProfile<string>;
  /** Post being replied to */
  replyTo?: IBasePostData<string>;
  /** Author of the post being replied to */
  replyToAuthor?: IBaseUserProfile<string>;
  /** Post being quoted */
  quotedPost?: IBasePostData<string>;
  /** Author of the quoted post */
  quotedPostAuthor?: IBaseUserProfile<string>;
  /** Available hubs for visibility selection */
  hubOptions?: IBaseHub<string>[];
  /** Whether the composer is in a submitting state */
  isSubmitting?: boolean;
  /** Callback when the post is submitted */
  onSubmit?: (data: PostComposerSubmitData) => void;
  /** Callback when the composer is cancelled/closed */
  onCancel?: () => void;
  /** Placeholder text for the editor */
  placeholder?: string;
  /** Maximum character count (defaults to 280, use HUB_POST_MAX_CHAR_COUNT for hub posts) */
  maxCharCount?: number;
  /** API client for staging file uploads */
  stagingApi?: {
    stageFile: (file: File) => Promise<ITempUploadResponse>;
    discardFile: (commitToken: string) => Promise<void>;
  };
}

/** Data submitted from the PostComposer */
export interface PostComposerSubmitData {
  /** Raw text content */
  content: string;
  /** Selected hub IDs for visibility restriction */
  hubIds: string[];
  /** ID of the post being replied to */
  replyToId?: string;
  /** ID of the post being quoted */
  quotedPostId?: string;
  /** Whether this is a blog post (enables full markdown rendering) */
  isBlogPost: boolean;
}

/**
 * PostComposer
 *
 * A textarea-based post creation component with a formatting toolbar,
 * media attachment support, character count indicator, and hub
 * visibility selection.
 */
export function PostComposer({
  currentUser,
  replyTo,
  replyToAuthor,
  quotedPost,
  quotedPostAuthor,
  hubOptions,
  isSubmitting = false,
  onSubmit,
  onCancel,
  placeholder,
  maxCharCount = DEFAULT_MAX_CHAR_COUNT,
  stagingApi,
}: PostComposerProps) {
  const { t } = useBrightHubTranslation();
  const [content, setContent] = useState('');
  const [selectedHubIds, setSelectedHubIds] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track staged image commit tokens for cleanup on discard
  const [stagedTokens, setStagedTokens] = useState<string[]>([]);
  // Track number of in-progress uploads for loading indicators
  const [uploadingCount, setUploadingCount] = useState(0);
  // Error message for upload failures
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Alt text editing dialog state
  const [altTextDialogOpen, setAltTextDialogOpen] = useState(false);
  const [editingImageUrl, setEditingImageUrl] = useState<string>('');
  const [editingAltText, setEditingAltText] = useState<string>('');

  // Top-level posts are blog posts (markdown enabled), replies are not
  const isReply = !!replyTo;
  const isBlogPost = !isReply;

  // Inline image count tracking
  const imageCount = useMemo(() => countInlineImages(content), [content]);
  const isAtImageLimit = imageCount >= getMaxInlineImages();

  const previewHtml = useMemo(
    () =>
      showPreview && content.trim()
        ? parsePostContent(content, isBlogPost)
        : '',
    [showPreview, content, isBlogPost],
  );

  const charCount = useMemo(
    () => getCharacterCount(content, isBlogPost),
    [content, isBlogPost],
  );
  const charRemaining = maxCharCount - charCount;
  const isOverLimit = charRemaining < 0;
  const canSubmit = content.trim().length > 0 && !isOverLimit && !isSubmitting;

  const charProgressValue = useMemo(
    () => Math.min((charCount / maxCharCount) * 100, 100),
    [charCount, maxCharCount],
  );

  const charProgressColor = useMemo(() => {
    if (isOverLimit) return 'error' as const;
    if (charRemaining <= 20) return 'warning' as const;
    return 'primary' as const;
  }, [isOverLimit, charRemaining]);

  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const insertMarkdown = useCallback(
    (prefix: string, suffix: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = content.substring(start, end);
      const newContent =
        content.substring(0, start) +
        prefix +
        selected +
        suffix +
        content.substring(end);
      setContent(newContent);
      // Restore focus after state update
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length + selected.length,
        );
      }, 0);
    },
    [content],
  );

  const handleBold = () => insertMarkdown('**', '**');
  const handleItalic = () => insertMarkdown('*', '*');
  const handleCode = () => insertMarkdown('`', '`');
  const handleEmoji = () => insertMarkdown('😊', '');

  /** Opens the hidden file input to select an image */
  const handleImageButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Handles image file selection from the file picker.
   * Inserts a loading placeholder, uploads to staging API,
   * then replaces the placeholder with the actual image markdown.
   */
  const handleImageSelect = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (!file || !stagingApi) return;

      // Check image limit before proceeding
      if (isAtImageLimit) return;

      const uploadingText = t(BrightHubStrings.PostComposer_Uploading);
      const placeholder = `![${uploadingText}](...)`;

      // Determine cursor position for insertion
      const textarea = textareaRef.current;
      const cursorPos = textarea ? textarea.selectionStart : content.length;

      // Insert loading placeholder at cursor position
      const contentBefore = content.substring(0, cursorPos);
      const contentAfter = content.substring(cursorPos);
      const contentWithPlaceholder = contentBefore + placeholder + contentAfter;
      setContent(contentWithPlaceholder);
      setUploadingCount((c) => c + 1);

      try {
        const response = await stagingApi.stageFile(file);

        // Replace placeholder with actual image markdown
        const imageMarkdown = `![](${response.previewUrl})`;
        setContent((prev) => prev.replace(placeholder, imageMarkdown));

        // Track the commit token for cleanup
        setStagedTokens((prev) => [...prev, response.commitToken]);
      } catch {
        // Remove placeholder on failure
        setContent((prev) => prev.replace(placeholder, ''));
        setUploadError(t(BrightHubStrings.PostComposer_ImageUploadFailed));
      } finally {
        setUploadingCount((c) => c - 1);
      }
    },
    [stagingApi, isAtImageLimit, content, t],
  );

  /**
   * Shared helper: uploads a single image file to staging and inserts
   * markdown at the given cursor position. Used by file picker, drag-and-drop,
   * and clipboard paste flows.
   */
  const uploadAndInsertImage = useCallback(
    async (file: File, insertPos: number) => {
      if (!stagingApi) return;

      const uploadingText = t(BrightHubStrings.PostComposer_Uploading);
      const placeholderText = `![${uploadingText}](...)`;

      setContent((prev) => {
        const before = prev.substring(0, insertPos);
        const after = prev.substring(insertPos);
        return before + placeholderText + after;
      });
      setUploadingCount((c) => c + 1);

      try {
        const response = await stagingApi.stageFile(file);
        const imageMarkdown = `![](${response.previewUrl})`;
        setContent((prev) => prev.replace(placeholderText, imageMarkdown));
        setStagedTokens((prev) => [...prev, response.commitToken]);
      } catch {
        setContent((prev) => prev.replace(placeholderText, ''));
        setUploadError(t(BrightHubStrings.PostComposer_ImageUploadFailed));
      } finally {
        setUploadingCount((c) => c - 1);
      }
    },
    [stagingApi, t],
  );

  /**
   * Task 10.4: Drag-and-drop image insertion.
   * Prevents default browser behavior and uploads dropped image files.
   * Respects the 20-image limit.
   */
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!stagingApi) return;

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        (INLINE_IMAGE_MIME_TYPES as readonly string[]).includes(f.type),
      );
      if (files.length === 0) return;

      // Check image limit
      const currentCount = countInlineImages(content);
      if (currentCount >= getMaxInlineImages()) {
        setUploadError(t(BrightHubStrings.PostComposer_ImageLimitReached));
        return;
      }

      // Use the end of content as the drop insertion position.
      // The textarea doesn't expose a reliable drop-position offset,
      // so we insert at the current cursor or end of content.
      const textarea = textareaRef.current;
      const insertPos = textarea ? textarea.selectionStart : content.length;

      for (const file of files) {
        const count = countInlineImages(content);
        if (count >= getMaxInlineImages()) {
          setUploadError(t(BrightHubStrings.PostComposer_ImageLimitReached));
          break;
        }
        await uploadAndInsertImage(file, insertPos);
      }
    },
    [stagingApi, content, t, uploadAndInsertImage],
  );

  /**
   * Task 10.5: Clipboard paste image insertion.
   * Checks clipboardData.items for image types and uploads them.
   * Respects the 20-image limit.
   */
  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLDivElement>) => {
      if (!stagingApi) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageItems: DataTransferItem[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          imageItems.push(items[i]);
        }
      }

      if (imageItems.length === 0) return;

      // Prevent default paste behavior for images
      e.preventDefault();

      // Check image limit
      const currentCount = countInlineImages(content);
      if (currentCount >= getMaxInlineImages()) {
        setUploadError(t(BrightHubStrings.PostComposer_ImageLimitReached));
        return;
      }

      const textarea = textareaRef.current;
      const insertPos = textarea ? textarea.selectionStart : content.length;

      for (const item of imageItems) {
        const count = countInlineImages(content);
        if (count >= getMaxInlineImages()) {
          setUploadError(t(BrightHubStrings.PostComposer_ImageLimitReached));
          break;
        }
        const file = item.getAsFile();
        if (file) {
          await uploadAndInsertImage(file, insertPos);
        }
      }
    },
    [stagingApi, content, t, uploadAndInsertImage],
  );

  /**
   * Task 10.6: Alt text editing mechanism.
   * Opens a dialog to edit the alt text of a specific image.
   */
  const handleOpenAltTextDialog = useCallback(
    (url: string, currentAlt: string) => {
      setEditingImageUrl(url);
      setEditingAltText(currentAlt);
      setAltTextDialogOpen(true);
    },
    [],
  );

  const handleSaveAltText = useCallback(() => {
    if (editingImageUrl) {
      setContent((prev) =>
        updateAltText(prev, editingImageUrl, editingAltText),
      );
    }
    setAltTextDialogOpen(false);
    setEditingImageUrl('');
    setEditingAltText('');
  }, [editingImageUrl, editingAltText]);

  const handleCloseAltTextDialog = useCallback(() => {
    setAltTextDialogOpen(false);
    setEditingImageUrl('');
    setEditingAltText('');
  }, []);

  /**
   * Task 10.6: Double-click handler on the textarea to detect clicks
   * on image markdown and open the alt text editor.
   */
  const handleTextareaDoubleClick = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const images = extractMarkdownImages(content);

    // Find the image whose markdown range contains the cursor position
    for (const img of images) {
      const fullMatch = `![${img.alt}](${img.url})`;
      const start = img.index;
      const end = start + fullMatch.length;
      if (cursorPos >= start && cursorPos <= end) {
        handleOpenAltTextDialog(img.url, img.alt);
        return;
      }
    }
  }, [content, handleOpenAltTextDialog]);

  // Extracted images for the alt text editing UI
  const inlineImages = useMemo(() => extractMarkdownImages(content), [content]);

  /**
   * Task 10.7: Staging cleanup on discard/navigate away.
   * Calls stagingApi.discardFile for each staged token on unmount.
   */
  const discardStagedImages = useCallback(async () => {
    if (!stagingApi || stagedTokens.length === 0) return;
    for (const token of stagedTokens) {
      try {
        await stagingApi.discardFile(token);
      } catch {
        // Silent failure — staging cleanup scheduler handles expiry
      }
    }
  }, [stagingApi, stagedTokens]);

  // Use a ref to always have the latest discardStagedImages
  const discardRef = useRef(discardStagedImages);
  discardRef.current = discardStagedImages;

  // Cleanup staged images on unmount
  useEffect(() => {
    return () => {
      discardRef.current();
    };
  }, []);

  /**
   * Task 10.7: Enhanced cancel handler that discards staged images.
   */
  const handleCancel = useCallback(() => {
    discardStagedImages();
    onCancel?.();
  }, [discardStagedImages, onCancel]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit?.({
      content,
      hubIds: selectedHubIds,
      replyToId: replyTo?._id,
      quotedPostId: quotedPost?._id,
      isBlogPost: isBlogPost,
    });
    // Reset composer after submit
    setContent('');
    setSelectedHubIds([]);
    setShowPreview(false);
  };

  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      {/* Reply context */}
      {replyTo && (
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {t(BrightHubStrings.PostComposer_ReplyingTo)}
          </Typography>
          <Typography variant="caption" color="primary">
            @{replyToAuthor?.username ?? 'unknown'}
          </Typography>
          {onCancel && (
            <IconButton
              size="small"
              onClick={handleCancel}
              aria-label={t(BrightHubStrings.PostComposer_CancelReply)}
              sx={{ ml: 'auto' }}
            >
              <Close sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1.5 }}>
        {/* Current user avatar */}
        <Avatar
          src={currentUser?.profilePictureUrl}
          sx={{ width: 40, height: 40 }}
        >
          {(currentUser?.displayName ?? 'U').charAt(0).toUpperCase()}
        </Avatar>

        <Box sx={{ flex: 1 }}>
          {/* Text input with drag-and-drop and paste support */}
          <Box onDragOver={handleDragOver} onDrop={handleDrop}>
            <TextField
              inputRef={textareaRef}
              multiline
              minRows={3}
              maxRows={8}
              fullWidth
              variant="standard"
              placeholder={
                replyTo
                  ? t(BrightHubStrings.PostComposer_ReplyPlaceholder)
                  : (placeholder ??
                    t(BrightHubStrings.PostComposer_Placeholder))
              }
              value={content}
              onChange={handleContentChange}
              onPaste={handlePaste}
              onDoubleClick={handleTextareaDoubleClick}
              disabled={isSubmitting}
              sx={{ display: showPreview ? 'none' : undefined }}
              slotProps={{
                input: {
                  disableUnderline: true,
                  sx: { fontSize: '1.1rem' },
                  'aria-label': replyTo
                    ? t(BrightHubStrings.PostComposer_ReplyPlaceholder)
                    : (placeholder ??
                      t(BrightHubStrings.PostComposer_Placeholder)),
                },
              }}
            />
          </Box>

          {/* Preview panel */}
          {showPreview && content.trim() && (
            <Box
              aria-label={t(BrightHubStrings.PostComposer_PreviewAriaLabel)}
              sx={{
                minHeight: 80,
                py: 1,
                '& p': { m: 0 },
                wordBreak: 'break-word',
                fontSize: '1.1rem',
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          )}

          {/* Quoted post preview */}
          {quotedPost && (
            <Card variant="outlined" sx={{ p: 1.5, mt: 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  mb: 0.5,
                }}
              >
                <Avatar
                  src={quotedPostAuthor?.profilePictureUrl}
                  sx={{ width: 20, height: 20 }}
                >
                  {(quotedPostAuthor?.displayName ?? '?').charAt(0)}
                </Avatar>
                <Typography variant="caption" fontWeight="bold">
                  {quotedPostAuthor?.displayName ?? 'Unknown'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  @{quotedPostAuthor?.username ?? 'unknown'}
                </Typography>
              </Box>
              <Typography variant="body2" noWrap>
                {quotedPost.content}
              </Typography>
            </Card>
          )}

          {/* Hub visibility selector */}
          {hubOptions && hubOptions.length > 0 && (
            <FormControl size="small" sx={{ mt: 1, minWidth: 200 }}>
              <InputLabel id="hub-select-label">
                {t(BrightHubStrings.PostComposer_VisibleTo)}
              </InputLabel>
              <Select
                labelId="hub-select-label"
                multiple
                value={selectedHubIds}
                onChange={(e) => setSelectedHubIds(e.target.value as string[])}
                label={t(BrightHubStrings.PostComposer_VisibleTo)}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((id) => {
                      const hub = hubOptions.find((c) => c._id === id);
                      return (
                        <Chip key={id} label={hub?.name ?? id} size="small" />
                      );
                    })}
                  </Box>
                )}
              >
                {hubOptions.map((hub) => (
                  <MenuItem key={hub._id} value={hub._id}>
                    {hub.name} ({hub.memberCount} members)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Toolbar and submit */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mt: 1,
              pt: 1,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            {/* Formatting toolbar */}
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <Tooltip title={t(BrightHubStrings.PostComposer_Bold)}>
                <IconButton
                  size="small"
                  onClick={handleBold}
                  aria-label={t(BrightHubStrings.PostComposer_Bold)}
                >
                  <FormatBold sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t(BrightHubStrings.PostComposer_Italic)}>
                <IconButton
                  size="small"
                  onClick={handleItalic}
                  aria-label={t(BrightHubStrings.PostComposer_Italic)}
                >
                  <FormatItalic sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t(BrightHubStrings.PostComposer_Code)}>
                <IconButton
                  size="small"
                  onClick={handleCode}
                  aria-label={t(BrightHubStrings.PostComposer_Code)}
                >
                  <Code sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title={t(BrightHubStrings.PostComposer_Emoji)}>
                <IconButton
                  size="small"
                  onClick={handleEmoji}
                  aria-label={t(BrightHubStrings.PostComposer_Emoji)}
                >
                  <EmojiEmotions sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
              <Tooltip
                title={
                  isAtImageLimit
                    ? t(BrightHubStrings.PostComposer_ImageLimitReached)
                    : t(BrightHubStrings.PostComposer_InsertImage)
                }
              >
                <span>
                  <IconButton
                    size="small"
                    onClick={handleImageButtonClick}
                    disabled={isAtImageLimit || !stagingApi}
                    aria-label={t(BrightHubStrings.PostComposer_InsertImage)}
                  >
                    <Image sx={{ fontSize: 20 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={t(BrightHubStrings.PostComposer_Preview)}>
                <ToggleButton
                  value="preview"
                  selected={showPreview}
                  onChange={() => setShowPreview((prev) => !prev)}
                  size="small"
                  aria-label={t(BrightHubStrings.PostComposer_Preview)}
                  sx={{ border: 'none', p: 0.5 }}
                >
                  <Visibility sx={{ fontSize: 20 }} />
                </ToggleButton>
              </Tooltip>
              <Tooltip title={t(BrightHubStrings.PostComposer_MarkupHelp)}>
                <IconButton
                  size="small"
                  onClick={() => setShowHelp(true)}
                  aria-label={t(BrightHubStrings.PostComposer_MarkupHelp)}
                >
                  <HelpOutline sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Character count and submit */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {content.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CircularProgress
                    variant="determinate"
                    value={charProgressValue}
                    size={24}
                    color={charProgressColor}
                    thickness={4}
                  />
                  <Typography
                    variant="caption"
                    color={
                      isOverLimit
                        ? 'error'
                        : charRemaining <= 20
                          ? 'warning.main'
                          : 'text.secondary'
                    }
                  >
                    {charRemaining}
                  </Typography>
                </Box>
              )}
              <Button
                variant="contained"
                size="small"
                onClick={handleSubmit}
                disabled={!canSubmit}
                startIcon={
                  isSubmitting ? <CircularProgress size={16} /> : <Send />
                }
                aria-label={t(BrightHubStrings.PostComposer_SubmitPost)}
              >
                {replyTo
                  ? t(BrightHubStrings.PostComposer_Reply)
                  : t(BrightHubStrings.PostComposer_Post)}
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
      <MarkupHelpDialog open={showHelp} onClose={() => setShowHelp(false)} />

      {/* Hidden file input for image picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept={INLINE_IMAGE_MIME_TYPES.join(',')}
        style={{ display: 'none' }}
        onChange={handleImageSelect}
        data-testid="image-file-input"
      />

      {/* Error snackbar for upload failures */}
      <Snackbar
        open={!!uploadError}
        autoHideDuration={4000}
        onClose={() => setUploadError(null)}
      >
        <Alert
          severity="error"
          onClose={() => setUploadError(null)}
          variant="filled"
        >
          {uploadError}
        </Alert>
      </Snackbar>

      {/* Alt text editing dialog (Task 10.6) */}
      <Dialog
        open={altTextDialogOpen}
        onClose={handleCloseAltTextDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {t(BrightHubStrings.PostComposer_EditAltText)}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label={t(BrightHubStrings.PostComposer_AltText)}
            value={editingAltText}
            onChange={(e) => setEditingAltText(e.target.value)}
            margin="dense"
            data-testid="alt-text-input"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAltTextDialog}>
            {t(BrightHubStrings.PostComposer_Cancel)}
          </Button>
          <Button onClick={handleSaveAltText} variant="contained">
            {t(BrightHubStrings.PostComposer_Save)}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Inline image alt text edit buttons (Task 10.6) */}
      {inlineImages.length > 0 && !showPreview && (
        <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {inlineImages.map((img, idx) => (
            <Chip
              key={`${img.url}-${idx}`}
              label={
                img.alt
                  ? `${t(BrightHubStrings.PostComposer_EditAltText)}: "${img.alt}"`
                  : t(BrightHubStrings.PostComposer_EditAltText)
              }
              size="small"
              onClick={() => handleOpenAltTextDialog(img.url, img.alt)}
              variant="outlined"
              data-testid={`edit-alt-text-${idx}`}
            />
          ))}
        </Box>
      )}
    </Card>
  );
}

export default PostComposer;
