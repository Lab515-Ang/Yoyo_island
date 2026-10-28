import math
def kf(keys, u):
    if u <= keys[0][0]: return keys[0][1]
    for i in range(1, len(keys)):
        if u <= keys[i][0]:
            t0, v0 = keys[i - 1]; t1, v1 = keys[i]; f = (1 - math.cos(math.pi * (u - t0) / (t1 - t0))) / 2
            return v0 + (v1 - v0) * f
    return keys[-1][1]
def walk(u):
    p = {}
    for leg, ph in [('leg_front', 0), ('leg_back_far', 0), ('leg_back', .5), ('leg_front_far', .5)]:
        v = (u + ph) % 1
        p[leg + '_upper'] = kf([[0, 6], [.5, -6], [1, 6]], v)
        p[leg + '_lower'] = kf([[0, 0], [.25, 12], [.5, -4], [.75, 0], [1, 0]], v)
        p[leg + '_paw'] = kf([[0, 8], [.25, 10], [.5, -6], [.75, 0], [1, 8]], v)
    w = 0.5 - 0.5 * math.cos(2 * math.pi * u * 2)
    p['ty'] = -4 * w; p['head'] = -1.5 * w; p['tail_2'] = -3 * (0.5 - 0.5 * math.cos(2 * math.pi * u))
    return p
