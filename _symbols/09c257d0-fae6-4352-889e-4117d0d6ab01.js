// Horizontal Scroller with JS Arrows - Updated March 8, 2024
function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
let src_url_equal_anchor;
function src_url_equal(element_src, url) {
    if (!src_url_equal_anchor) {
        src_url_equal_anchor = document.createElement('a');
    }
    src_url_equal_anchor.href = url;
    return element_src === src_url_equal_anchor.href;
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* generated by Svelte v3.59.1 */

function create_fragment(ctx) {
	let div2;
	let div0;
	let img0;
	let img0_src_value;
	let t0;
	let img1;
	let img1_src_value;
	let t1;
	let img2;
	let img2_src_value;
	let t2;
	let img3;
	let img3_src_value;
	let t3;
	let img4;
	let img4_src_value;
	let t4;
	let img5;
	let img5_src_value;
	let t5;
	let img6;
	let img6_src_value;
	let t6;
	let img7;
	let img7_src_value;
	let t7;
	let img8;
	let img8_src_value;
	let t8;
	let img9;
	let img9_src_value;
	let t9;
	let img10;
	let img10_src_value;
	let t10;
	let img11;
	let img11_src_value;
	let t11;
	let img12;
	let img12_src_value;
	let t12;
	let img13;
	let img13_src_value;
	let t13;
	let img14;
	let img14_src_value;
	let t14;
	let img15;
	let img15_src_value;
	let t15;
	let img16;
	let img16_src_value;
	let t16;
	let img17;
	let img17_src_value;
	let t17;
	let img18;
	let img18_src_value;
	let t18;
	let img19;
	let img19_src_value;
	let t19;
	let div1;
	let span0;
	let t20;
	let t21;
	let span1;
	let t22;

	return {
		c() {
			div2 = element("div");
			div0 = element("div");
			img0 = element("img");
			t0 = space();
			img1 = element("img");
			t1 = space();
			img2 = element("img");
			t2 = space();
			img3 = element("img");
			t3 = space();
			img4 = element("img");
			t4 = space();
			img5 = element("img");
			t5 = space();
			img6 = element("img");
			t6 = space();
			img7 = element("img");
			t7 = space();
			img8 = element("img");
			t8 = space();
			img9 = element("img");
			t9 = space();
			img10 = element("img");
			t10 = space();
			img11 = element("img");
			t11 = space();
			img12 = element("img");
			t12 = space();
			img13 = element("img");
			t13 = space();
			img14 = element("img");
			t14 = space();
			img15 = element("img");
			t15 = space();
			img16 = element("img");
			t16 = space();
			img17 = element("img");
			t17 = space();
			img18 = element("img");
			t18 = space();
			img19 = element("img");
			t19 = space();
			div1 = element("div");
			span0 = element("span");
			t20 = text("⟵");
			t21 = space();
			span1 = element("span");
			t22 = text("⟶");
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div0 = claim_element(div2_nodes, "DIV", { id: true, class: true });
			var div0_nodes = children(div0);
			img0 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t0 = claim_space(div0_nodes);
			img1 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t1 = claim_space(div0_nodes);
			img2 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t2 = claim_space(div0_nodes);
			img3 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t3 = claim_space(div0_nodes);
			img4 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t4 = claim_space(div0_nodes);
			img5 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t5 = claim_space(div0_nodes);
			img6 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t6 = claim_space(div0_nodes);
			img7 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t7 = claim_space(div0_nodes);
			img8 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t8 = claim_space(div0_nodes);
			img9 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t9 = claim_space(div0_nodes);
			img10 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t10 = claim_space(div0_nodes);
			img11 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t11 = claim_space(div0_nodes);
			img12 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t12 = claim_space(div0_nodes);
			img13 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t13 = claim_space(div0_nodes);
			img14 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t14 = claim_space(div0_nodes);
			img15 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t15 = claim_space(div0_nodes);
			img16 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t16 = claim_space(div0_nodes);
			img17 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t17 = claim_space(div0_nodes);
			img18 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			t18 = claim_space(div0_nodes);
			img19 = claim_element(div0_nodes, "IMG", { src: true, alt: true, class: true });
			div0_nodes.forEach(detach);
			t19 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			span0 = claim_element(div1_nodes, "SPAN", { class: true, onclick: true });
			var span0_nodes = children(span0);
			t20 = claim_text(span0_nodes, "⟵");
			span0_nodes.forEach(detach);
			t21 = claim_space(div1_nodes);
			span1 = claim_element(div1_nodes, "SPAN", { class: true, onclick: true });
			var span1_nodes = children(span1);
			t22 = claim_text(span1_nodes, "⟶");
			span1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			if (!src_url_equal(img0.src, img0_src_value = "https://picsum.photos/450/300")) attr(img0, "src", img0_src_value);
			attr(img0, "alt", "image1");
			attr(img0, "class", "svelte-1et1nnr");
			if (!src_url_equal(img1.src, img1_src_value = "https://picsum.photos/450/300?t=1")) attr(img1, "src", img1_src_value);
			attr(img1, "alt", "image2");
			attr(img1, "class", "svelte-1et1nnr");
			if (!src_url_equal(img2.src, img2_src_value = "https://picsum.photos/450/300?t=2")) attr(img2, "src", img2_src_value);
			attr(img2, "alt", "image3");
			attr(img2, "class", "svelte-1et1nnr");
			if (!src_url_equal(img3.src, img3_src_value = "https://picsum.photos/450/300?p=13")) attr(img3, "src", img3_src_value);
			attr(img3, "alt", "image4");
			attr(img3, "class", "svelte-1et1nnr");
			if (!src_url_equal(img4.src, img4_src_value = "https://picsum.photos/450/300?4")) attr(img4, "src", img4_src_value);
			attr(img4, "alt", "image5");
			attr(img4, "class", "svelte-1et1nnr");
			if (!src_url_equal(img5.src, img5_src_value = "https://picsum.photos/450/300?5")) attr(img5, "src", img5_src_value);
			attr(img5, "alt", "image1");
			attr(img5, "class", "svelte-1et1nnr");
			if (!src_url_equal(img6.src, img6_src_value = "https://picsum.photos/450/300?6")) attr(img6, "src", img6_src_value);
			attr(img6, "alt", "image2");
			attr(img6, "class", "svelte-1et1nnr");
			if (!src_url_equal(img7.src, img7_src_value = "https://picsum.photos/450/300?r")) attr(img7, "src", img7_src_value);
			attr(img7, "alt", "image3");
			attr(img7, "class", "svelte-1et1nnr");
			if (!src_url_equal(img8.src, img8_src_value = "https://picsum.photos/450/300?g")) attr(img8, "src", img8_src_value);
			attr(img8, "alt", "image4");
			attr(img8, "class", "svelte-1et1nnr");
			if (!src_url_equal(img9.src, img9_src_value = "https://picsum.photos/450/300?d")) attr(img9, "src", img9_src_value);
			attr(img9, "alt", "image5");
			attr(img9, "class", "svelte-1et1nnr");
			if (!src_url_equal(img10.src, img10_src_value = "https://picsum.photos/450/300?s")) attr(img10, "src", img10_src_value);
			attr(img10, "alt", "image1");
			attr(img10, "class", "svelte-1et1nnr");
			if (!src_url_equal(img11.src, img11_src_value = "https://picsum.photos/450/300?e")) attr(img11, "src", img11_src_value);
			attr(img11, "alt", "image2");
			attr(img11, "class", "svelte-1et1nnr");
			if (!src_url_equal(img12.src, img12_src_value = "https://picsum.photos/450/300?z")) attr(img12, "src", img12_src_value);
			attr(img12, "alt", "image3");
			attr(img12, "class", "svelte-1et1nnr");
			if (!src_url_equal(img13.src, img13_src_value = "https://picsum.photos/450/300?x")) attr(img13, "src", img13_src_value);
			attr(img13, "alt", "image4");
			attr(img13, "class", "svelte-1et1nnr");
			if (!src_url_equal(img14.src, img14_src_value = "https://picsum.photos/450/300?c")) attr(img14, "src", img14_src_value);
			attr(img14, "alt", "image5");
			attr(img14, "class", "svelte-1et1nnr");
			if (!src_url_equal(img15.src, img15_src_value = "https://picsum.photos/450/300?v")) attr(img15, "src", img15_src_value);
			attr(img15, "alt", "image1");
			attr(img15, "class", "svelte-1et1nnr");
			if (!src_url_equal(img16.src, img16_src_value = "https://picsum.photos/450/300?b")) attr(img16, "src", img16_src_value);
			attr(img16, "alt", "image2");
			attr(img16, "class", "svelte-1et1nnr");
			if (!src_url_equal(img17.src, img17_src_value = "https://picsum.photos/450/300?n")) attr(img17, "src", img17_src_value);
			attr(img17, "alt", "image3");
			attr(img17, "class", "svelte-1et1nnr");
			if (!src_url_equal(img18.src, img18_src_value = "https://picsum.photos/450/300?m")) attr(img18, "src", img18_src_value);
			attr(img18, "alt", "image4");
			attr(img18, "class", "svelte-1et1nnr");
			if (!src_url_equal(img19.src, img19_src_value = "https://picsum.photos/450/300?mm")) attr(img19, "src", img19_src_value);
			attr(img19, "alt", "image5");
			attr(img19, "class", "svelte-1et1nnr");
			attr(div0, "id", "scroller");
			attr(div0, "class", "svelte-1et1nnr");
			attr(span0, "class", "arrow svelte-1et1nnr");
			attr(span0, "onclick", "clickDown()");
			attr(span1, "class", "arrow svelte-1et1nnr");
			attr(span1, "onclick", "clickUp()");
			attr(div1, "class", "arrows svelte-1et1nnr");
			attr(div2, "class", "container svelte-1et1nnr");
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			append_hydration(div2, div0);
			append_hydration(div0, img0);
			append_hydration(div0, t0);
			append_hydration(div0, img1);
			append_hydration(div0, t1);
			append_hydration(div0, img2);
			append_hydration(div0, t2);
			append_hydration(div0, img3);
			append_hydration(div0, t3);
			append_hydration(div0, img4);
			append_hydration(div0, t4);
			append_hydration(div0, img5);
			append_hydration(div0, t5);
			append_hydration(div0, img6);
			append_hydration(div0, t6);
			append_hydration(div0, img7);
			append_hydration(div0, t7);
			append_hydration(div0, img8);
			append_hydration(div0, t8);
			append_hydration(div0, img9);
			append_hydration(div0, t9);
			append_hydration(div0, img10);
			append_hydration(div0, t10);
			append_hydration(div0, img11);
			append_hydration(div0, t11);
			append_hydration(div0, img12);
			append_hydration(div0, t12);
			append_hydration(div0, img13);
			append_hydration(div0, t13);
			append_hydration(div0, img14);
			append_hydration(div0, t14);
			append_hydration(div0, img15);
			append_hydration(div0, t15);
			append_hydration(div0, img16);
			append_hydration(div0, t16);
			append_hydration(div0, img17);
			append_hydration(div0, t17);
			append_hydration(div0, img18);
			append_hydration(div0, t18);
			append_hydration(div0, img19);
			append_hydration(div2, t19);
			append_hydration(div2, div1);
			append_hydration(div1, span0);
			append_hydration(span0, t20);
			append_hydration(div1, t21);
			append_hydration(div1, span1);
			append_hydration(span1, t22);
		},
		p: noop,
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div2);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(0, props = $$props.props);
	};

	return [props];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 0 });
	}
}

export { Component as default };
