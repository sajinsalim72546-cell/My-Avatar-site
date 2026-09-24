"""
extract_frames.py - High-Precision Head Pose & WebP Frame Extractor
-------------------------------------------------------------------
Extracts 64 high-quality circular trajectory WebP frames along the 360° head
rotation without any artificial head-slicing masks, ensuring the entire head
(eyes, face, jaw, beard, hair, and neck) turns naturally as a complete unit.
"""

import os
import cv2
import numpy as np

def main():
    video_path = os.path.join("public", "character.mp4")
    frames_dir = os.path.join("public", "frames")
    os.makedirs(frames_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Could not open video at {video_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"[1] Video Properties: {width}x{height}, {fps} FPS, {total_frames} total frames")

    raw_frames = []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        raw_frames.append(frame)
    cap.release()

    # Detect exact background color
    corners = [
        raw_frames[0][10, 10], raw_frames[0][10, width - 10],
        raw_frames[10][10, 10], raw_frames[10][10, width - 10]
    ]
    avg_bgr = np.mean(corners, axis=0)
    b, g, r = [int(round(x)) for x in avg_bgr]
    bg_hex = f"#{r:02x}{g:02x}{b:02x}"
    print(f"[2] Background Color: RGB({r}, {g}, {b}) -> {bg_hex}")

    # 8 Compass Directions & Center Frame:
    # Frame 12: Direct frontal eye contact, neutral smile
    # Frame 29: RIGHT (0 deg)
    # Frame 26: DOWN-RIGHT (45 deg)
    # Frame 72: DOWN (90 deg)
    # Frame 104: DOWN-LEFT (135 deg)
    # Frame 118: LEFT (180 deg)
    # Frame 134: UP-LEFT (225 deg)
    # Frame 58: UP (270 deg)
    # Frame 38: UP-RIGHT (315 deg)
    print("[3] 8 Compass Directions & Center Frame:")
    print("    - CENTER:     Frame 12 (Direct eye contact, neutral smile)")
    print("    - RIGHT:      Frame 29 (0 deg / 3 o'clock)")
    print("    - DOWN-RIGHT: Frame 26 (45 deg / 4:30 o'clock)")
    print("    - DOWN:       Frame 72 (90 deg / 6 o'clock)")
    print("    - DOWN-LEFT:  Frame 104 (135 deg / 7:30 o'clock)")
    print("    - LEFT:       Frame 118 (180 deg / 9 o'clock)")
    print("    - UP-LEFT:    Frame 134 (225 deg / 10:30 o'clock)")
    print("    - UP:         Frame 58 (270 deg / 12 o'clock)")
    print("    - UP-RIGHT:   Frame 38 (315 deg / 1:30 o'clock)")

    # 64-frame circular trajectory map (clockwise starting from 0 rad / RIGHT)
    frame_map = [
        # 0..7: RIGHT (0°) to DOWN-RIGHT (45°)
        29, 29, 28, 28, 27, 27, 26, 26,
        # 8..15: DOWN-RIGHT (45°) to DOWN (90°)
        26, 25, 25, 74, 74, 73, 72, 72,
        # 16..23: DOWN (90°) to DOWN-LEFT (135°)
        72, 84, 86, 88, 90, 94, 98, 104,
        # 24..31: DOWN-LEFT (135°) to LEFT (180°)
        106, 108, 110, 112, 114, 116, 117, 118,
        # 32..39: LEFT (180°) to UP-LEFT (225°)
        120, 122, 124, 126, 128, 130, 132, 134,
        # 40..47: UP-LEFT (225°) to UP (270°)
        134, 135, 136, 64, 63, 62, 60, 58,
        # 48..55: UP (270°) to UP-RIGHT (315°)
        56, 54, 52, 49, 46, 43, 40, 38,
        # 56..63: UP-RIGHT (315°) to RIGHT (360/0°)
        36, 34, 33, 32, 31, 30, 30, 29
    ]

    print("[4] Exporting center.webp (Full natural head with direct eye contact)...")
    center_img = raw_frames[12]
    cv2.imwrite(os.path.join("public", "center.webp"), center_img, [cv2.IMWRITE_WEBP_QUALITY, 95])

    print("[5] Exporting 64 high-quality WebP frames (full natural head rotation)...")
    for i, f_num in enumerate(frame_map):
        frame = raw_frames[f_num]
        cv2.imwrite(os.path.join(frames_dir, f"frame_{i:02d}.webp"), frame, [cv2.IMWRITE_WEBP_QUALITY, 95])
        cv2.imwrite(os.path.join(frames_dir, f"{i}.webp"), frame, [cv2.IMWRITE_WEBP_QUALITY, 95])

    print("[6] Completed! Whole head turns naturally with zero artifacts.")

if __name__ == "__main__":
    main()
