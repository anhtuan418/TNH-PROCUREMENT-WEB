(function(){
'use strict';

var PORTAL_API='https://tynhqzxhgxrjhamccxcl.supabase.co/functions/v1/vendor-portal-rfq';
var SUBMIT_API='https://tynhqzxhgxrjhamccxcl.supabase.co/functions/v1/vendor-quote-submit';
var token=new URLSearchParams(location.hash.slice(1)).get('invite')||'';
var portal=null;

function $(id){return document.getElementById(id)}
function setMsg(el,text,type){el.className='msg '+(type||'err');el.textContent=text}
function input(type,cls){var x=document.createElement('input');x.type=type;x.className=cls;return x}

function row(item,current){
  var tr=document.createElement('tr');tr.dataset.itemId=item.id;
  var td=[];for(var i=0;i<11;i++){var c=document.createElement('td');tr.appendChild(c);td.push(c)}
  td[0].textContent=item.item_no;
  var n=document.createElement('div');n.style.fontWeight='800';n.textContent=item.item_name;td[1].appendChild(n);
  var m=document.createElement('div');m.className='muted';m.textContent=(item.specification||item.description||'')+' | '+item.quantity+' '+item.unit;td[1].appendChild(m);

  var status=document.createElement('select');status.className='response';
  status.innerHTML='<option value="QUOTED">Có báo giá</option><option value="NO_QUOTE">Không báo giá</option>';td[2].appendChild(status);

  var brand=input('text','brand');td[3].appendChild(brand);
  var model=input('text','model');td[4].appendChild(model);
  var origin=input('text','origin');td[5].appendChild(origin);
  var price=input('number','unit-price');price.min='0';price.step='0.01';td[6].appendChild(price);
  var vat=input('number','vat');vat.min='0';vat.max='100';vat.step='0.01';td[7].appendChild(vat);
  var lead=input('number','lead');lead.min='0';lead.step='1';td[8].appendChild(lead);
  var warranty=input('number','warranty');warranty.min='0';warranty.step='1';td[9].appendChild(warranty);
  var note=input('text','item-note');td[10].appendChild(note);

  if(current){
    status.value=current.response_status||'QUOTED';
    brand.value=current.brand||'';model.value=current.model||'';origin.value=current.origin||'';
    price.value=current.unit_price==null?'':current.unit_price;
    vat.value=current.vat_rate==null?'':current.vat_rate;
    lead.value=current.lead_time_days==null?'':current.lead_time_days;
    warranty.value=current.warranty_months==null?'':current.warranty_months;
    note.value=current.note||'';
  }

  function sync(){
    var no=status.value==='NO_QUOTE';
    [brand,model,origin,price,vat,lead,warranty].forEach(function(x){x.disabled=no});
    if(no)price.value='';
  }
  status.addEventListener('change',sync);sync();return tr;
}

async function load(){
  if(token.length<32){setMsg($('status'),'Liên kết mời báo giá không hợp lệ.');return}
  try{
    var r=await fetch(PORTAL_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token})});
    var d=await r.json().catch(function(){return {}});
    if(!r.ok||!d.ok)throw new Error(d.message||d.code||'Không tải được RFQ');

    portal=d;$('status').classList.add('hidden');$('app').classList.remove('hidden');
    $('rfqTitle').textContent=d.rfq.rfq_code+' — '+d.rfq.title;
    $('rfqMeta').textContent='Hạn gửi: '+new Date(d.rfq.deadline_at).toLocaleString('vi-VN')+' | Trạng thái: '+d.rfq.status;
    $('vendorMeta').textContent='Nhà cung cấp: '+d.vendor.name+' | MST: '+d.vendor.tax_code;
    $('inviteBadge').textContent=d.invitation_status;

    var current=new Map((d.current_quotation&&d.current_quotation.items||[]).map(function(x){return [x.rfq_item_id,x]}));
    var body=$('itemBody');body.replaceChildren();
    (d.items||[]).forEach(function(it){body.appendChild(row(it,current.get(it.id)))});

    $('paymentTerm').value=d.current_quotation&&d.current_quotation.payment_term||'';
    $('validUntil').value=d.current_quotation&&d.current_quotation.quote_valid_until||'';
    $('note').value=d.current_quotation&&d.current_quotation.note||'';

    var req=['PDF báo giá bắt buộc'];
    if(d.rfq.require_catalog)req.push('Catalog bắt buộc');
    if(d.rfq.require_manufacturer_authorization)req.push('Ủy quyền hãng bắt buộc');
    $('fileRequirement').textContent=req.join(' • ');
    $('submitBtn').disabled=!d.can_submit;
    if(!d.can_submit)setMsg($('submitMessage'),'RFQ hiện không còn nhận báo giá.','warn');
  }catch(e){setMsg($('status'),e.message||String(e))}
}

$('quoteForm').addEventListener('submit',async function(e){
  e.preventDefault();if(!portal||!portal.can_submit)return;

  var rows=[].slice.call(document.querySelectorAll('#itemBody tr'));
  var items=[];
  for(var i=0;i<rows.length;i++){
    var tr=rows[i],response=tr.querySelector('.response').value,price=tr.querySelector('.unit-price').value;
    if(response==='QUOTED'&&price===''){setMsg($('submitMessage'),'Cần nhập đơn giá cho tất cả dòng chọn Có báo giá.');return}
    items.push({
      rfq_item_id:tr.dataset.itemId,response_status:response,
      brand:tr.querySelector('.brand').value,model:tr.querySelector('.model').value,origin:tr.querySelector('.origin').value,
      unit_price:response==='QUOTED'?Number(price):null,vat_rate:tr.querySelector('.vat').value,
      lead_time_days:tr.querySelector('.lead').value,warranty_months:tr.querySelector('.warranty').value,
      payment_term:$('paymentTerm').value,note:tr.querySelector('.item-note').value
    });
  }

  var pdf=$('quotePdf').files[0];
  if(!pdf){setMsg($('submitMessage'),'PDF báo giá là bắt buộc.');return}
  if(portal.rfq.require_catalog&&!$('catalog').files[0]){setMsg($('submitMessage'),'RFQ yêu cầu Catalog.');return}
  if(portal.rfq.require_manufacturer_authorization&&!$('authorization').files[0]){setMsg($('submitMessage'),'RFQ yêu cầu Ủy quyền hãng.');return}

  var fd=new FormData();
  fd.append('token',token);fd.append('submission_key',crypto.randomUUID());fd.append('items',JSON.stringify(items));
  fd.append('quote_valid_until',$('validUntil').value);fd.append('payment_term',$('paymentTerm').value);fd.append('note',$('note').value);fd.append('quote_pdf',pdf);
  if($('catalog').files[0])fd.append('catalog',$('catalog').files[0]);
  if($('authorization').files[0])fd.append('authorization',$('authorization').files[0]);

  $('submitBtn').disabled=true;setMsg($('submitMessage'),'Đang gửi báo giá...','warn');
  try{
    var r=await fetch(SUBMIT_API,{method:'POST',body:fd});
    var d=await r.json().catch(function(){return {}});
    if(!r.ok||!d.ok)throw new Error(d.message||d.code||'Gửi báo giá thất bại');
    setMsg($('submitMessage'),'Đã ghi nhận báo giá thành công — phiên bản '+d.version_no+'.','ok');
    await load();
  }catch(e){setMsg($('submitMessage'),e.message||String(e));$('submitBtn').disabled=false}
});

load();
})();