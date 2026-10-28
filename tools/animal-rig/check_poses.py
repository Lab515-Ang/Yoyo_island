"""每個動作的極端姿勢，裁關節附近 1:1 拼成檢查圖 checks/<pose>.png"""
import os, sys
import cv2, numpy as np
import pose

POSES = {
    'look':  ({'head_base': -7, 'ear_near': -10, 'ear_far': -8}, (), [(700, 180, 1254, 720)]),
    'sniff': ({'head_base': 15}, (), [(700, 250, 1254, 850)]),
    'jaw':   ({'jaw': 10}, (), [(950, 450, 1254, 720)]),
    'blink': ({}, ('eye_open',), [(950, 350, 1254, 600)]),
    'tail_a': ({'tail_1': -6, 'tail_2': -9, 'tail_3': -12}, (), [(0, 200, 450, 820)]),
    'tail_b': ({'tail_1': 6, 'tail_2': 9, 'tail_3': 12}, (), [(0, 200, 450, 820)]),
    'walk_a': ({'leg_back_upper': 4, 'leg_back_lower': -12, 'leg_back_paw': 8,
                'leg_front_upper': -4, 'leg_front_lower': 12, 'leg_front_paw': -8,
                'leg_back_far_upper': -4, 'leg_back_far_lower': 12, 'leg_back_far_paw': -8,
                'leg_front_far_upper': 4, 'leg_front_far_lower': -12, 'leg_front_far_paw': 8},
               (), [(130, 640, 640, 1130), (620, 640, 1100, 1130)]),
    'walk_b': ({'leg_back_upper': -4, 'leg_back_lower': 12, 'leg_back_paw': -8,
                'leg_front_upper': 4, 'leg_front_lower': -12, 'leg_front_paw': 8,
                'leg_back_far_upper': 4, 'leg_back_far_lower': -12, 'leg_back_far_paw': 8,
                'leg_front_far_upper': -4, 'leg_front_far_lower': 12, 'leg_front_far_paw': -8},
               (), [(130, 640, 640, 1130), (620, 640, 1100, 1130)]),
}
os.makedirs('checks', exist_ok=True)
for name in (sys.argv[1:] or POSES):
    ang, hide, crops = POSES[name]
    im = pose.render(ang, hide=tuple(hide) + (() if 'eye_open' in hide else ('eye_closed',)))
    parts = [im[y0:y1, x0:x1] for x0, y0, x1, y1 in crops]
    h = max(p.shape[0] for p in parts)
    sheet = np.hstack([np.vstack([p, np.full((h - p.shape[0], p.shape[1], 3), 128, np.uint8)]) for p in parts])
    cv2.imwrite(f'checks/{name}.png', sheet)
print('ok')
