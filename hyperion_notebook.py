"""Standard-library extraction helpers, embedded into Hyperion.ipynb by the build script."""
import base64 as _ht_base64
import hashlib as _ht_hashlib
import json as _ht_json
import os as _ht_os
import struct as _ht_struct
import uuid as _ht_uuid
from collections import OrderedDict as _ht_OrderedDict

# Set this to the GitHub Pages URL of this directory after publishing.
HYPERION_SITE_URL = ''  #@param {type:"string"}
HYPERION_TABLE_VERSION = '__TABLE_VERSION__'
_ht_contexts = _ht_OrderedDict()
_HT_RECORD_SIZE = 132
_HT_MAX_RECORDS = 10000
_HT_MAX_BYTES = 2 * 1024 * 1024
_HT_NONE = 0xffffffff


def _ht_signature(stat):
    # Windows stat/fstat expose different ctime semantics; Colab/Linux ctime is useful.
    return (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns if _ht_os.name != 'nt' else 0)


def hyperion_bind_result(results, output_name):
    """Bind displayed indices to this result file; never consult a later form value."""
    path = _ht_os.path.realpath(_ht_os.path.join('saves', output_name + '.hype.bin'))
    with open(path, 'rb') as source:
        header = source.read(8)
        stat = _ht_os.fstat(source.fileno())
    if len(header) != 8:
        raise ValueError('結果ファイルのヘッダーが不正です。')
    start, count = _ht_struct.unpack('<II', header)
    if start > count or stat.st_size != 8 + count * _HT_RECORD_SIZE:
        raise ValueError('結果ファイルのサイズが不正です。')
    if results.get('index') != start or results.get('size') != count:
        raise ValueError('表示結果と結果ファイルが一致しません。再検索してください。')
    context_id = _ht_uuid.uuid4().hex
    _ht_contexts[context_id] = (path, _ht_signature(stat), header)
    while len(_ht_contexts) > 32:
        _ht_contexts.popitem(last=False)
    results['_hyperion_context'] = context_id
    return results


def hyperion_export_tree(context_id, selected_index):
    """Return only exact raw records reachable from the selected result or ancestor."""
    try:
        if context_id not in _ht_contexts:
            raise ValueError('この検索結果は古くなっています。再検索してください。')
        path, signature, header = _ht_contexts[context_id]
        start, count = _ht_struct.unpack('<II', header)
        if type(selected_index) is not int or not 0 <= selected_index < count:
            raise ValueError('選択レコード番号が不正です。')
        records, active, done, heights = {}, set(), set(), {}
        with open(path, 'rb') as source:
            if _ht_signature(_ht_os.fstat(source.fileno())) != signature or source.read(8) != header:
                raise ValueError('結果ファイルが変更されています。再検索してください。')
            stack = [(selected_index, 0, False)]
            while stack:
                index, depth, exiting = stack.pop()
                if depth > 128:
                    raise ValueError('家系図の世代数が上限を超えています。')
                if exiting:
                    left, right = _ht_struct.unpack_from('<II', records[index], 124)
                    heights[index] = 0 if left == _HT_NONE else 1 + max(heights[left], heights[right])
                    active.remove(index)
                    done.add(index)
                    continue
                if index in active:
                    raise ValueError('親参照が循環しています。')
                if index in done:
                    if depth + heights[index] > 128:
                        raise ValueError('家系図の世代数が上限を超えています。')
                    continue
                if not 0 <= index < count:
                    raise ValueError('親のレコード番号が範囲外です。')
                if len(records) >= _HT_MAX_RECORDS:
                    raise ValueError('抽出する個体数が上限を超えています。')
                source.seek(8 + index * _HT_RECORD_SIZE)
                record = source.read(_HT_RECORD_SIZE)
                if len(record) != _HT_RECORD_SIZE:
                    raise ValueError('結果ファイルが途中で切れています。')
                records[index] = record
                left, right = _ht_struct.unpack_from('<II', record, 124)
                if (left == _HT_NONE) != (right == _HT_NONE):
                    raise ValueError('片方だけの親参照には対応していません。')
                active.add(index)
                stack.append((index, depth, True))
                if left != _HT_NONE:
                    stack.extend([(right, depth + 1, False), (left, depth + 1, False)])
            if _ht_signature(_ht_os.fstat(source.fileno())) != signature or _ht_signature(_ht_os.stat(path)) != signature:
                raise ValueError('抽出中に結果ファイルが変更されました。再検索してください。')
        indices = sorted(records)
        metadata = {
            'schemaVersion': 1, 'recordSize': 132, 'byteOrder': 'little-endian',
            'selectedIndex': selected_index, 'recordIndices': indices,
            'sourceStart': start, 'sourceCount': count, 'fileName': _ht_os.path.basename(path),
            'tableVersion': HYPERION_TABLE_VERSION,
            'sourceHash': globals().get('source_hash', ''), 'datasetCommit': globals().get('dataset_commit', '')
        }
        encoded = _ht_json.dumps(metadata, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        payload = b'HYTREE01' + _ht_struct.pack('<I', len(encoded)) + encoded + b''.join(records[i] for i in indices)
        if len(payload) > _HT_MAX_BYTES:
            raise ValueError('転送容量の上限を超えています。対象の家系図を小さくしてください。')
        return {'base64': _ht_base64.b64encode(payload).decode('ascii'), 'sha256': _ht_hashlib.sha256(payload).hexdigest()}
    except (ValueError, OSError) as error:
        return {'error': str(error)}
